![Sauce](images/logo_horiz_320x120.png)
===========
#### A browser extension for Chrome
The Sauce extension supplements athletic websites like https://strava.com with better
cycling and running information.  It's a simple, lightweight and pure client-side javascript
addition.  There are no external API calls made with this extension and it is open source.

[![intro](http://img.youtube.com/vi/ySEDoexDyXU/0.jpg)](http://www.youtube.com/watch?v=ySEDoexDyXU)


Feature Highlights
--------
 * Peak performance table:
   * Power
   * Normalized Power
   * Heartrate
   * Pace
   * Grade Adjusted Pace
   * VAM (climbing speed)
 * Export any activity to a TCX or GPX file
 * Running Power estimation
 * Analysis page stats are extended to include:
   * Elapsed power average, normalized power, moving power average and watts/kg.
   * Grade adjusted pace
   * TSS
   * Intensity Factory
   * VAM
   * Elevation gain/loss
   * Raw data and graph views
 * Weight and FTP overrides for all athletes
 * Inline comments system for activity page
 * Dashboard features:
   * Chronological ordering
   * Hide virtual activities (except your own)
   * Hide promotions and challenges


Installation
--------
#### Official version:
[![chrome web store](images/ChromeWebStore_Badge_v2_206x58.png)](https://chrome.google.com/webstore/detail/strava-sauce/eigiefcapdcdmncdghkeahgfmnobigha)

#### Development version:
 1. Download [ZIP file](https://github.com/mayfield/sauce/archive/master.zip)
    or clone this repo to your local computer.
 2. (ZIP only) Unzip the downloaded zip file.
 3. Go to chrome://extensions/ on your Chrome browser.
 4. Make sure "Developer mode" is checked.
 5. Click "Load unpacked extension..."
 6. Navigate to the directory  where you cloned or unzipped sauce and click "Open."


Release Notes
--------
#### v5.0.0
 * Multi category peak effort chart:
   * Power, NP, VAM, HR, Pace, GAP
 * Settable peak effort ranges: time periods and distances (Advanced Options).
 * Upgraded algo for power data.
 * Upgraded analysis view that works in all locales.
   * Kilojoule field
   * Moving vs elapsed time stats.
   * Improved placement on page.
 * Running power (watts) estimate **[BETA]**.
 * Raw data views; CSV table and graphs.
 * Kilojoules in analysis view.
 * Updated algo for VAM calculations (smoothing).
 * Rank badges for analysis selections.
 * Support for HiDPI graphs.

#### v4.3.0:
 * TCX and GPX export **[BETA]**.

#### v4.1.0:
 * Support for VAM (vertical ascent meters / hour) **[BETA]**.

#### v4.0.0:
 * Peak power calculations now support irregular recording intervals (non 1 sample / second).
 * Fixes to running pace calculations.
 * Add elevation stats to peak power and best pace dialogs.
 * Add cadence stat to peak power and best pace dialogs.
 * Support auto closing dialogs when clicking away from them.
 * Much needed code cleanup.
 * Add name information to Advanced menu's FTP overrides table.

#### v3.2.0:
 * Show average pace in running "Best Pace" chart instead of elapsed time.
 * Use kilometer based pace for metric loving athletes.

#### v3.0.0:
 * Activity Feed Filtering (click the sauce bottle to change):
   * Show/hide virtual runs and rides (e.g. Zwift)
   * Show/hide promotions
   * Show/hide challenges
 * World Ranking badges for segments

#### v2.0.0:
 * Running support.

#### v1.2.0:
 * Fixes for several loading glitches.
 * Smoother FTP override handling;  Added clearing support.
 * Fix for ranking badges when gender is unspecified.
 * Style and tooltip additions to better explain peak power.

#### v1.1.0:
 * Fix analysis view's inline comments to accommodate site changes.
 * Minor style tweak for analysis view.

#### v1.0.0:
 * Fix for updated strava comment data structure
 * Improved device compatibility of peak power analysis

#### v0.1.0:
 * Heartrate stats in Peak Power table
 * Promise of reasonable stability

#### v0.0.7:
 * Normalized power for selections in Analysis tab.

#### v0.0.6:
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
[Privacy Policy](https://mayfield.github.com/sauce/pages/privacy.html)
