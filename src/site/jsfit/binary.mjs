// vim: ts=4:sw=4:expandtab
/* eslint indent: "off" */

import * as fit from './fit.mjs';

export function addEndian(littleEndian, bytes) {
    let result = 0;
    if (!littleEndian) bytes.reverse();
    for (let i = 0; i < bytes.length; i++) {
        result += (bytes[i] << (i << 3)) >>> 0;
    }
    return result;
}


function readTypedData(buf, fDef) {
    const typedBuf = new fDef.baseType.TypedArray(fDef.size / fDef.baseType.size);
    const view = new DataView(buf.buffer, buf.byteOffset, fDef.size);
    const typeName = typedBuf.constructor.name.split('Array')[0];
    const isLittleEndian = fDef.endianAbility ? fDef.littleEndian : true; // XXX Not sure if we should default to true.
    for (let i = 0; i < typedBuf.length; i++) {
        // if (fDef.baseType.size > 1 && (!fDef.endianAbility || fDef.littleEndian)) { debugger; }
        typedBuf[i] = view[`get${typeName}`](i * typedBuf.BYTES_PER_ELEMENT, isLittleEndian);
    }
    return typedBuf;
}

function writeTypedData(data, fDef) {
    const typeName = fDef.baseType.TypedArray.name.split('Array')[0];
    const typeSize = fDef.baseType.TypedArray.BYTES_PER_ELEMENT;
    const isLittleEndian = fDef.endianAbility ? fDef.littleEndian : true; // XXX Not sure if we should default to true.
    let view;
    if (typeof data === 'bigint' || typeof data === 'number') {
        view = new DataView(new ArrayBuffer(typeSize));
        view[`set${typeName}`](0, data, isLittleEndian);
    } else if (data instanceof Array) {
        view = new DataView(new ArrayBuffer(typeSize * data.length));
        for (let i = 0; i < data.length; i++) {
            view[`set${typeName}`](i * fDef.baseType.size, data[i], isLittleEndian);
        }
    } else if (data instanceof fDef.baseType.TypedArray) {
        return data;  // No copy/conversion needed.
    } else {
        throw new TypeError(`Unsupported data type: ${data}`);
    }
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}


function encodeTypedData(data, fDef, fields) {
    const type = fDef.attrs.type;
    const isArray = type.endsWith('_array');
    const rootType = isArray ? type.split('_array')[0] : type;
    let customType;
    try {
        getBaseTypeId(rootType);
    } catch(e) {
        if (!(e instanceof ReferenceError)) {
            throw e;
        }
        customType = fit.typesIndex[type];
        if (!customType) {
            throw new TypeError(`Unsupported type: ${type}`);
        }
    }
    function encode(x) {
        if (customType) {
            if (customType.decode && !customType.encode) {
                throw new TypeError(`Type encode/decode parity mismatch: ${type}`);
            } else if (customType.encode) {
                return customType.encode(x, data, fields);
            } else if (customType.mask) {
                if (typeof x === 'number') {
                    return x;
                } else if (x && x.value) {
                    let value = x.value;
                    if (x.flags) {
                        for (const flag of x.flags) {
                            value |= customType.values[flag] || 0;
                        }
                    }
                    return value;
                } else {
                    throw new TypeError('Improperly configured mask value');
                }
            } else {
                if (Object.prototype.hasOwnProperty.call(customType.values, x)) {
                    return customType.values[x];
                } else {
                    return x;
                }
            }
        } else {
            switch (rootType) {
                case 'enum':
                case 'byte':
                case 'sint8':
                case 'sint16':
                case 'sint32':
                case 'sint64':
                case 'uint8':
                case 'uint16':
                case 'uint32':
                case 'uint64':
                case 'uint8z':
                case 'uint16z':
                case 'uint32z':
                case 'uint64z':
                    return fDef.attrs.scale ? (x - fDef.attrs.offset) * fDef.attrs.scale : x;
                case 'string': {
                    const te = new TextEncoder();
                    const bytes = te.encode(data);
                    return joinBuffers([bytes, Uint8Array.from([0])]);
                }
                default:
                    throw new TypeError(`Unhandled root type: ${rootType}`);
            }
        }
    }
    return isArray ? data.map(encode) : encode(data);
}

function decodeTypedData(data, fDef, fields) {
    const type = fDef.attrs.type;
    const isArray = type.endsWith('_array');
    const rootType = isArray ? type.split('_array')[0] : type;
    let customType;
    try {
        getBaseTypeId(rootType);
    } catch(e) {
        if (!(e instanceof ReferenceError)) {
            throw e;
        }
        customType = fit.types[type];
        if (!customType) {
            throw new TypeError(`Unsupported type: ${type}`);
        }
    }
    function decode(x) {
        if (customType) {
            if (customType.decode) {
                return customType.decode(x, data, fields);
            } else if (customType.mask) {
                const result = {flags:[]};
                for (const [key, label] of Object.entries(customType)) {
                    const flag = Number(key);
                    if (isNaN(flag)) {
                        continue;
                    }
                    if ((x & flag) === flag) {
                        result.flags.push(label);
                    }
                }
                if (customType.mask) {
                    result.value = x & customType.mask;
                }
                return result;
            } else {
                if (Object.prototype.hasOwnProperty.call(customType, x)) {
                    return customType[x];
                } else {
                    return x;
                }
            }
        } else {
            switch (rootType) {
                case 'enum':
                case 'byte':
                case 'sint8':
                case 'sint16':
                case 'sint32':
                case 'sint64':
                case 'uint8':
                case 'uint16':
                case 'uint32':
                case 'uint64':
                case 'uint8z':
                case 'uint16z':
                case 'uint32z':
                case 'uint64z':
                    return fDef.attrs.scale ? x / fDef.attrs.scale + fDef.attrs.offset : x;
                case 'string': {
                    const td = new TextDecoder();
                    const nullIndex = data.indexOf(0);
                    if (nullIndex !== -1) {
                        return td.decode(data.slice(0, nullIndex));
                    } else {
                        return td.decode(data);
                    }
                }
                default:
                    throw new TypeError(`Unhandled root type: ${rootType}`);
            }
        }
    }
    return isArray ? Array.from(data).map(decode) : decode(data[0]);
}

function getInvalidValue(type) {
    const bt = fit.getBaseType(getBaseTypeId(type));
    if (bt === undefined) {
        throw new TypeError(`Invalid type: ${type}`);
    }
    return bt.invalid;
}

export function writeMessage(msg, localMsgTypes, devFields) {
    const buffers = [];
    for (const fDef of msg.mDef.fieldDefs) {
        const value = msg.fields[fDef.attrs.field];
        if (value == null) {
            const typedBuf = new fDef.baseType.TypedArray(1);
            typedBuf[0] = getInvalidValue(fDef.baseType.name);
            fDef.size = typedBuf.byteLength;
            buffers.push(typedBuf);
        } else {
            const encodedData = encodeTypedData(value, fDef, msg.fields);
            const buf = writeTypedData(encodedData, fDef);
            fDef.size = buf.byteLength;
            buffers.push(buf);
        }
    }
    const mDefSig = JSON.stringify(msg.mDef);
    const hasMatchingDef = mDefSig in localMsgTypes;
    const localMsgType = hasMatchingDef ? localMsgTypes[mDefSig] : Object.keys(localMsgTypes).length;
    const dataHeader = new Uint8Array(1);
    dataHeader[0] = localMsgType & 0xf;
    buffers.unshift(dataHeader);
    if (!hasMatchingDef) {
        localMsgTypes[mDefSig] = localMsgType;
        const defBuf = new Uint8Array(6 + (msg.mDef.fieldDefs.length * 3)); // XXX does not support devfields
        const defView = new DataView(defBuf.buffer, defBuf.byteOffset, defBuf.byteLength);
        const definitionFlag = 0x40;
        defView.setUint8(0, (localMsgType & 0xf) | definitionFlag);
        const littleEndian = msg.mDef.littleEndian;
        defView.setUint8(2, littleEndian ? 0 : 1);
        defView.setUint16(3, msg.mDef.globalMessageNumber, littleEndian);
        defView.setUint8(5, msg.mDef.fieldDefs.length);
        let offt = 6;
        for (const fDef of msg.mDef.fieldDefs) {
            if (fDef.isDevField) {
                throw new Error("XXX dev fields not supported yet");
            }
            defView.setUint8(offt++, fDef.fDefNum);
            defView.setUint8(offt++, fDef.size);
            defView.setUint8(offt++, fDef.baseTypeId);
        }
        buffers.unshift(defBuf);
    }
    return joinBuffers(buffers);
}

export function joinBuffers(buffers) {
    const size = buffers.reduce((acc, x) => acc + x.byteLength, 0);
    const fullBuf = new Uint8Array(size);
    let offt = 0;
    for (const x of buffers) {
        fullBuf.set(x, offt);
        offt += x.byteLength;
    }
    return fullBuf;
}

export function readMessage(buf, definitions, devFields) {
    const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const recordHeader = dataView.getUint8(0);
    const localMessageType = recordHeader & 0xf;
    const definitionFlag = 0x40;
    if ((recordHeader & definitionFlag) === definitionFlag) {
        return readDefinitionMessage(dataView, recordHeader, localMessageType, definitions, devFields);
    } else {
        return readDataMessage(dataView, recordHeader, localMessageType, definitions, devFields);
    }
}

function readDefinitionMessage(dataView, recordHeader, localMessageType, definitions, devFields) {
    const devDataFlag = 0x20;
    const hasDevData = (recordHeader & devDataFlag) === devDataFlag;
    const littleEndian = dataView.getUint8(2) === 0;
    const endianFlag = 0x80;
    const fieldCount = dataView.getUint8(5);
    const devFieldCount = hasDevData ?  dataView.getUint8(5 + (fieldCount * 3) + 1) : 0;
    const mDef = {
        littleEndian,
        globalMessageNumber: dataView.getUint16(3, littleEndian),
        fieldCount: fieldCount + devFieldCount,
        fieldDefs: [],
    };
    const message = fit.messages[mDef.globalMessageNumber];
    for (let i = 0; i < fieldCount; i++) {
        const fDefIndex = 6 + (i * 3);
        const fDefNum = dataView.getUint8(fDefIndex);
        const baseTypeId = dataView.getUint8(fDefIndex + 2);
        const baseType = fit.getBaseType(baseTypeId);
        let attrs = message && message[fDefNum];
        if (!attrs) {
            attrs = {
                field: `UNDOCUMENTED[${fDefNum}]`,
                type: baseType.name
            };
            console.warn(`Undocumented field: (${baseType.name}) ${message && message.name}[${fDefNum}]`); 
        }
        mDef.fieldDefs.push({
            attrs,
            fDefNum,
            size: dataView.getUint8(fDefIndex + 1),
            endianAbility: (baseTypeId & endianFlag) === endianFlag,
            littleEndian,
            baseTypeId,
            baseType,
        });
    }
    for (let i = 0; i < devFieldCount; i++) {
        const fDefIndex = 6 + (fieldCount * 3) + 1 + (i * 3);
        const fDefNum = dataView.getUint8(fDefIndex);
        const size = dataView.getUint8(fDefIndex + 1);
        const devDataIndex = dataView.getUint8(fDefIndex + 2);
        const devDef = devFields[devDataIndex][fDefNum];
        const baseTypeId = devDef.fit_base_type_id;
        mDef.fieldDefs.push({
            attrs: {
                field: devDef.field_name,
                scale: devDef.scale,
                offset: devDef.offset,
                type: fit.types.fit_base_type[baseTypeId],
            },
            fDefNum,
            size,
            endianAbility: (baseTypeId & endianFlag) === endianFlag,
            littleEndian,
            baseTypeId,
            baseType: fit.getBaseType(baseTypeId),
            devDataIndex: devDataIndex,
            isDevField: true,
        });
    }
    definitions[localMessageType] = mDef;
    const size = 6 + (mDef.fieldCount * 3) + (hasDevData ? 1 : 0);
    return {
        type: 'definition',
        mDef,
        size,
    };
}

function readDataMessage(dataView, recordHeader, localMessageType, definitions, devFields) {
    const mDef = definitions[localMessageType] || definitions[0];
    const compressedFlag = 0x80;
    if ((recordHeader & compressedFlag) === compressedFlag) {
        // TODO: handle compressed header
        throw new TypeError("Compressed header not supported"); 
    }
    let offt = 1;
    let size = 1;
    const fields = {};
    const message = fit.messages[mDef.globalMessageNumber];
    if (!message) {
        console.warn(`Invalid message number: ${mDef.globalMessageNumber}`);
    }
    for (let i = 0; i < mDef.fieldDefs.length; i++) {
        const fDef = mDef.fieldDefs[i];
        const fBuf = new Uint8Array(dataView.buffer, dataView.byteOffset + offt, fDef.size);
        const typedDataArray = readTypedData(fBuf, fDef);
        if (getInvalidValue(fDef.baseType.name) !== typedDataArray[0]) {
            fields[fDef.attrs.field] = decodeTypedData(typedDataArray, fDef, fields);
        }
        offt += fDef.size;
        size += fDef.size;
    }
    if (message && message.name === 'field_description') {
        devFields[fields.developer_data_index] = devFields[fields.developer_data_index] || {};
        devFields[fields.developer_data_index][fields.field_definition_number] = fields;
    }
    return {
        type: 'data',
        size,
        mDef,
        fields,
    };
}

export function getArrayBuffer(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return buffer;
    }
    const ab = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }
    return ab;
}

export function calculateCRC(buf, start, end) {
    const crcTable = [
        0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
    ];

    let crc = 0;
    for (let i = (start || 0); i < (end || buf.length); i++) {
        const byte = buf[i];
        let tmp = crcTable[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ crcTable[byte & 0xF];
        tmp = crcTable[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xF];
    }

    return crc;
}

export function leBytes(value, TypedArray) {
    return new Uint8Array(new TypedArray([value]).buffer);
}

export function uint32leBytes(value) {
    return leBytes(value, Uint32Array);
}

export function uint16leBytes(value) {
    return leBytes(value, Uint16Array);
}

export function getBaseTypeId(key) {
    for (const [id, label] of Object.entries(fit.types.fit_base_type)) {
        if (label === key) {
            return id;
        }
    }
    throw new ReferenceError(`Unknown base type: ${key}`);
}
