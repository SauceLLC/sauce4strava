sauce - Chrome Extension ![logo](https://github.com/mayfield/sauce/raw/master/images/logo_vert_120x320.png "Sauce")
===========
The Sauce extension supplements athletic websites like https://strava.com with better
cycling and running information.  It's a simple, lightweight and pure client-side javascript
addition.  There are no external API calls made with this extension and it is open source.

[![intro](http://img.youtube.com/vi/ySEDoexDyXU/0.jpg)](http://www.youtube.com/watch?v=ySEDoexDyXU)


Feature Highlights
--------
 * Critical Power table for cycling activities
 * Best Pace table for running activities
 * TSS calculations
 * FTP overrides for all athletes, regardless of subscription
 * Normalized Power calculations for selections in Analysis page
 * Viewing cyclist's weight
 * VAM calculations for cycling climbs (BETA)
 * Inline comments system in Activity page
 * Export TCX and GPX files for ALL rides and runs (BETA)


Installation
--------
[![Official Version](https://github.com/mayfield/sauce/raw/master/images/ChromeWebStore_Badge_v2_340x96.png)](https://chrome.google.com/webstore/detail/strava-sauce/eigiefcapdcdmncdghkeahgfmnobigha)
from Google Web Store

*or*

Install the development version:
 1. Download [ZIP file](https://github.com/mayfield/sauce/archive/master.zip)
    or clone this repo to your local computer.
 2. (ZIP only) Unzip the downloaded zip file.
 3. Go to chrome://extensions/ on your Chrome browser.
 4. Make sure "Developer mode" is checked.
 5. Click "Load unpacked extension..."
 6. Navigate to the directory  where you cloned or unzipped sauce and click "Open."


Release Notes
--------
v5.0.0
 * Upgraded algo for power data.
 * Upgraded analysis view that works in all locales (finally!).
   * Kilojoule field
   * Moving vs elapsed time stats.
   * Improved placement on page.
 * Running power (watts) estimate [BETA].
 * Raw data views; CSV table and graphs.
 * Kilojoules in analysis view.
 * Updated algo for VAM calculations (smoothing).
 * Support for HiDPI graphs.

v4.3.0:
 * Beta support for TCX and GPX export.

v4.1.0:
 * Support for VAM (vertical ascent meters / hour) [BETA].

v4.0.0:
 * Critical power calculations now support irregular recording intervals (non 1 sample / second).
 * Fixes to running pace calculations.
 * Add elevation stats to critical power and best pace dialogs.
 * Add cadence stat to critical power and best pace dialogs.
 * Support auto closing dialogs when clicking away from them.
 * Much needed code cleanup.
 * Add name information to Advanced menu's FTP overrides table.

v3.2.0:
 * Show average pace in running "Best Pace" chart instead of elapsed time.
 * Use kilometer based pace for metric loving athletes.

v3.0.0:
 * Activity Feed Filtering (click the sauce bottle to change):
   * Show/hide virtual runs and rides (e.g. Zwift)
   * Show/hide promotions
   * Show/hide challenges
 * World Ranking badges for segments

v2.0.0:
 * Running support.

v1.2.0:
 * Fixes for several loading glitches.
 * Smoother FTP override handling;  Added clearing support.
 * Fix for ranking badges when gender is unspecified.
 * Style and tooltip additions to better explain critical power.

v1.1.0:
 * Fix analysis view's inline comments to accommodate site changes.
 * Minor style tweak for analysis view.

v1.0.0:
 * Fix for updated strava comment data structure
 * Improved device compatibility of critical power analysis

v0.1.0:
 * Heartrate stats in Critical Power table
 * Promise of reasonable stability

v0.0.7:
 * Normalized power for selections in Analysis tab.

v0.0.6:
 * Inline comments


Disclaimer
--------
I don't work for Strava nor have I interacted with any persons from Strava in the writing
of this extension.  Much of the work is inspired by the Strava Enhancement Suite, which I
can also recommend in conjunction with this extension.  All the information used in this
extension is readily available within the Strava.com website.


Legal
--------
Because lawyers and Google:
[Privacy Policy](https://mayfield.github.com/strava-sauce/pages/privacy.html)
