/* global sauce */

sauce.ns('export', function() {
    'use strict';

    class DOMSerializer {
        constructor(name, start) {
            this.name = name;
            this.start = start;
            this.doc = new Document();
        }

        addNodeTo(parent, name, textValue) {
            const node = parent.appendChild(this.doc.createElement(name));
            if (textValue != null) {
                node.textContent = textValue.toString();
            }
            return node;
        }

        loadStreams(streams) {
            throw new Error("pure virtual");
        }

        toFile() {
            const heading = `<?xml version="${this.doc.xmlVersion}" encoding="${this.doc.inputEncoding}"?>\n`;
            return new File(
                [heading + (new XMLSerializer()).serializeToString(this.doc)],
                `${this.name}.${this.fileExt}`.replace(/\s/g, '_'),
                {type: 'text/xml'}
            );
        }
    }


    class GPXSerializer extends DOMSerializer {

        constructor(name, type, start) {
            super(name, start);
            this.fileExt = 'gpx';
            this.rootNode = this.addNodeTo(this.doc, 'gpx');
            this.rootNode.setAttribute('creator', 'Strava Sauce');
            this.rootNode.setAttribute('version', '1.1');
            this.rootNode.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1');
            this.rootNode.setAttribute('xmlns:gpxtpx', 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1');
            this.rootNode.setAttribute('xmlns:gpxx', 'http://www.garmin.com/xmlschemas/GpxExtensions/v3');
            this.rootNode.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:schemaLocation', [
                'http://www.topografix.com/GPX/1/1',
                'http://www.topografix.com/GPX/1/1/gpx.xsd',
                'http://www.garmin.com/xmlschemas/GpxExtensions/v3',
                'http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd',
                'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
                'http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd'
            ].join(' '));
            const metadata = this.addNodeTo(this.rootNode, 'metadata');
            this.addNodeTo(metadata, 'time', start.toISOString());
            const trk = this.addNodeTo(this.rootNode, 'trk');
            this.addNodeTo(trk, 'name', name);
            // I can't find any docs on this enum.
            // I got these values by examining garmin output (strava uses numbers! lol).
            const trackTypeEnum = {
                Ride: 'cycling',
                Run: 'running'
            };
            this.addNodeTo(trk, 'type', trackTypeEnum[type]);
            this.trkseg = this.addNodeTo(trk, 'trkseg');
        }

        loadStreams(streams) {
            const startTime = this.start.getTime();
            for (let i = 0; i < streams.time.length; i++) {
                const point = this.addNodeTo(this.trkseg, 'trkpt');
                if (streams.latlng) {
                    const [lat, lon] = streams.latlng[i];
                    point.setAttribute('lat', lat);
                    point.setAttribute('lon', lon);
                }
                const t = (new Date(startTime + (streams.time[i] * 1000)));
                this.addNodeTo(point, 'time', t.toISOString());
                if (streams.altitude) {
                    this.addNodeTo(point, 'ele', streams.altitude[i]);
                }
                const ext = this.addNodeTo(point, 'extensions');
                if (streams.watts) {
                    const watts = streams.watts[i];
                    if (watts !== null) {
                        this.addNodeTo(ext, 'power', watts);
                    }
                }
                if (streams.temp || streams.heartrate || streams.cadence) {
                    const tpx = this.addNodeTo(ext, 'gpxtpx:TrackPointExtension');
                    if (streams.temp) {
                        this.addNodeTo(tpx, 'gpxtpx:atemp', streams.temp[i]);
                    }
                    if (streams.heartrate) {
                        this.addNodeTo(tpx, 'gpxtpx:hr', streams.heartrate[i]);
                    }
                    if (streams.cadence) {
                        this.addNodeTo(tpx, 'gpxtpx:cad', streams.cadence[i]);
                    }
                }
            }
        }
    }


    class TCXSerializer extends DOMSerializer {

        constructor(name, type, start) {
            super(name, start);
            this.fileExt = 'tcx';
            this.rootNode = this.addNodeTo(this.doc, 'TrainingCenterDatabase');
            this.rootNode.setAttribute('xmlns', 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2');
            this.rootNode.setAttribute('xmlns:up', 'http://www.garmin.com/xmlschemas/UserProfile/v2');
            this.rootNode.setAttribute('xmlns:ax', 'http://www.garmin.com/xmlschemas/ActivityExtension/v2');
            this.rootNode.setAttribute('xmlns:px', 'http://www.garmin.com/xmlschemas/ProfileExtension/v1');
            this.rootNode.setAttribute('xmlns:ag', 'http://www.garmin.com/xmlschemas/ActivityGoals/v1');
            this.rootNode.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:schemaLocation', [
                'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2',
                'http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd'
            ].join(' '));
            const author = this.addNodeTo(this.rootNode, 'Author');
            author.setAttribute('xsi:type', 'Application_t');
            this.addNodeTo(author, 'Name', sauce.name);
            this.addNodeTo(author, 'LangID', 'en');
            this.addNodeTo(author, 'PartNumber', '867-5309');
            const build = this.addNodeTo(author, 'Build');
            const sauceVersion = this.addNodeTo(build, 'Version');
            const [vmajor, vminor, bmajor, bminor] = sauce.version.split('.');
            this.addNodeTo(sauceVersion, 'VersionMajor', vmajor);
            this.addNodeTo(sauceVersion, 'VersionMinor', vminor);
            this.addNodeTo(sauceVersion, 'BuildMajor', bmajor);
            this.addNodeTo(sauceVersion, 'BuildMinor', bminor || 0);

            const activities = this.addNodeTo(this.rootNode, 'Activities');
            const activity = this.addNodeTo(activities, 'Activity');
            const sportEnum = {
                Ride: 'Biking',
                Run: 'Running'
            };
            activity.setAttribute('Sport', sportEnum[type] || 'Other');
            const startISOString = start.toISOString();
            this.addNodeTo(activity, 'Id', startISOString);  // Garmin does, so we will to.
            const creator = this.addNodeTo(activity, 'Creator');
            creator.setAttribute('xsi:type', 'Device_t');
            this.addNodeTo(creator, 'Name', sauce.name);
            this.addNodeTo(creator, 'UnitId', 0);
            this.addNodeTo(creator, 'ProductId', 0);
            creator.appendChild(sauceVersion);
        
            const lap = this.addNodeTo(activity, 'Lap');
            lap.setAttribute('StartTime', startISOString);
            // Skipping: TotalTimeSeconds, DistenceMeters, Calories, Intensity, Cadence, Extensions
            this.addNodeTo(lap, 'TriggerMethod', 'Manual');
            this.track = this.addNodeTo(lap, 'Track');
        }

        loadStreams(streams) {
            const startTime = this.start.getTime();
            for (let i = 0; i < streams.time.length; i++) {
                const point = this.addNodeTo(this.track, 'Trackpoint');
                const t = (new Date(startTime + (streams.time[i] * 1000)));
                this.addNodeTo(point, 'Time', t.toISOString());
                if (streams.latlng) {
                    const [lat, lon] = streams.latlng[i];
                    const position = this.addNodeTo(point, 'Position');
                    this.addNodeTo(position, 'LatitudeDegrees', lat);
                    this.addNodeTo(position, 'LongitudeDegrees', lon);
                }
                if (streams.altitude) {
                    this.addNodeTo(point, 'AltitudeMeters', streams.altitude[i]);
                }
                if (streams.distance) {
                    this.addNodeTo(point, 'DistanceMeters', streams.distance[i]);
                }
                if (streams.heartrate) {
                    const hr = this.addNodeTo(point, 'HeartRateBpm');
                    this.addNodeTo(hr, 'Value', streams.heartrate[i]);
                }
                if (streams.cadence) {
                    this.addNodeTo(point, 'Cadence', streams.cadence[i]);
                }
                if (streams.watts) {
                    const ext = this.addNodeTo(point, 'Extensions');
                    const tpx = this.addNodeTo(ext, 'TPX');
                    tpx.setAttribute('xmlns', 'http://www.garmin.com/xmlschemas/ActivityExtension/v2');
                    const watts = streams.watts[i];
                    if (watts !== null) {
                        this.addNodeTo(tpx, 'Watts', watts);
                    }
                }
            }
        }
    }


    return {
        GPXSerializer,
        TCXSerializer,
    };
});
