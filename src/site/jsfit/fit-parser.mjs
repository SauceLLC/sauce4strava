// vim: ts=4:sw=4:expandtab

import * as bin from './binary.mjs';
import * as fit from './fit.mjs';


export default class FitParser {
    constructor() {
        this.messages = [];
        this._devFields = {};
    }

    static decode(content) {
        const ab = bin.getArrayBuffer(content);
        const buf = new Uint8Array(ab);
        const dataView = new DataView(ab);
        if (buf.byteLength < 12) {
            throw new TypeError('File to small to be a FIT file');
        }
        const headerLength = dataView.getUint8(0);
        if (headerLength !== 14 && headerLength !== 12) {
            throw new TypeError('Incorrect header size');
        }
        let fileTypeString = '';
        for (let i = 8; i < 12; i++) {
            fileTypeString += String.fromCharCode(dataView.getUint8(i));
        }
        if (fileTypeString !== '.FIT') {
            throw new TypeError('Missing \'.FIT\' in header');
        }
        let hasCrcHeader;
        if (headerLength === 14) {
            const crcHeader = dataView.getUint16(12, /*LE*/ true);
            if (crcHeader) {
                hasCrcHeader = true;
                const crcHeaderCalc = bin.calculateCRC(buf, 0, 12);
                if (crcHeader !== crcHeaderCalc) {
                    throw new Error('Header CRC mismatch');
                }
            }
        }
        const dataLength = dataView.getUint32(4, /*LE*/ true);
        const dataEnd = dataLength + headerLength;
        const crcFile = dataView.getUint16(dataEnd, /*LE*/ true);
        const crcFileCalc = bin.calculateCRC(buf, hasCrcHeader ? headerLength : 0, dataEnd);
        if (crcFile !== crcFileCalc) {
            throw new Error('File CRC mismatch');
        }
        const instance = new this();
        let offt = headerLength;
        const definitions = {};
        while (offt < dataEnd) {
            const rBuf = new Uint8Array(buf.buffer, buf.byteOffset + offt);
            const msg = bin.readMessage(rBuf, definitions, instance._devFields);
            if (msg.type === 'data') {
                instance.messages.push(msg);
            }
            offt += msg.size;
        }
        return instance;
    }

    encode() {
        const headerBuf = new Uint8Array(14);
        headerBuf[0] = 14;  // header size;
        const version_major = 1;
        const version_minor = 0;
        headerBuf[1] = version_major << 4 | version_minor;
        const profile_version_major = 20;
        const profile_version_minor = 96;
        const profile_version = profile_version_major * 100 + profile_version_minor;
        headerBuf.set(bin.uint16leBytes(profile_version), 2);
        headerBuf.set('.FIT'.split('').map(x => x.charCodeAt(0)), 8);
        const localMsgTypes = new Map();
        const dataBuf = bin.joinBuffers(this.messages.map(x =>
            bin.writeMessage(x, localMsgTypes, this._devFields)));
        headerBuf.set(bin.uint32leBytes(dataBuf.byteLength), 4);
        const headerCrc = bin.calculateCRC(headerBuf, 0, 12);
        headerBuf.set(bin.uint16leBytes(headerCrc), 12);
        const crcBuf = new Uint8Array(2);
        const crc = bin.calculateCRC(dataBuf);
        crcBuf.set(bin.uint16leBytes(crc));
        return bin.joinBuffers([headerBuf, dataBuf, crcBuf]);
    }

    addMessage(globalMessage, fields) {
        const message = fit.messagesIndex[globalMessage];
        const littleEndian = true;
        const mDef = {
            littleEndian,
            globalMessageNumber: message.id,
            fieldCount: Object.keys(fields).length,
            fieldDefs: [],
        };
        for (const key of Object.keys(fields)) {
            const attrs = message.fields[key];
            if (!attrs) {
                throw new TypeError(`Invalid field: ${globalMessage}[${key}]`);
            }
            const baseTypeName = (fit.typesIndex[attrs.type] ?
                fit.typesIndex[attrs.type].type :
                attrs.type).split('_array')[0];
            const baseType = fit.getBaseTypeByName(baseTypeName);
            const baseTypeId = fit.typesIndex.fit_base_type.values[baseTypeName];
            const endianFlag = 0x80;
            mDef.fieldDefs.push({
                attrs,
                fDefNum: attrs.defNum,
                size: undefined,  // Must be set via encoder.
                endianAbility: (baseTypeId & endianFlag) === endianFlag,
                littleEndian,
                baseTypeId,
                baseType,
            });
        }
        this.messages.push({
            type: 'data',
            size: undefined,
            mDef,
            fields,
        });
    }
}
