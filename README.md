Sauce for Strava™
===========
![Sauce](images/logo_horiz_320x120.png)
#### A browser extension for Strava.com
Sauce for Strava™ is a browser extension that upgrades strava.com with more stats,
features and themes (e.g. dark-mode).

It's lightweight, powerful and open source!


[![become a patron](images/become_a_patron_button.png)](https://www.patreon.com/bePatron?u=32064618)

Installation
--------
#### Official versions:
 > [![chrome web store](assets/images/ChromeWebStore_Badge_v2_206x58.png)](https://chrome.google.com/webstore/detail/eigiefcapdcdmncdghkeahgfmnobigha)
 > 
 > ![Stars](https://img.shields.io/chrome-web-store/stars/eigiefcapdcdmncdghkeahgfmnobigha?color=darkgreen)
 > ![Version](https://img.shields.io/chrome-web-store/v/eigiefcapdcdmncdghkeahgfmnobigha?label=version)
 > ![Users](https://img.shields.io/chrome-web-store/users/eigiefcapdcdmncdghkeahgfmnobigha?color=orange)

 > [![firefox add on](assets/images/AMO-button_1.png)](https://addons.mozilla.org/addon/sauce4strava)
 > 
 > ![Stars](https://img.shields.io/amo/stars/sauce4strava?label=rating&color=darkgreen)
 > ![Version](https://img.shields.io/amo/v/sauce4strava?label=version)
 > ![Users](https://img.shields.io/amo/users/sauce4strava?color=orange)

--------
![slideshow](assets/images/screenshots/slideshow.gif)


Feature Highlights
--------
 * Peak performance table:
   * Power
   * [Normalized Power®](#tp)
   * Heart Rate
   * Pace
   * Grade Adjusted Pace
   * VAM (climbing speed)
   * Cadence
   * Sea Power (potential power at sea level)
 * Themes (including dark mode)
    * Only works on old school pages like Analysis
 * Export any activity to a TCX, GPX or FIT file
 * Create Live Segments for any effort (including downhills)
 * Running Power estimation
 * ~~Kudo All Activities~~
    * Removed due to support overhead and abuse
 * Beers and Donuts earned for an activity (based on kcals burned)
 * Analysis page stats are extended to include:
   * Elapsed power average, normalized power, moving power average and watts/kg.
   * Grade adjusted pace
   * [TSS®](#tp)
   * [Intensity Factory®](#tp)
   * VAM
   * Elevation gain/loss
   * Raw data and graph views
   * Sea Power
   * Pw:Hr / Aerobic Decoupling
 * Weight and FTP overrides for all athletes
 * Inline comments system for activity page
 * Performance Predictor
 * Dashboard features:
   * Hide virtual activities (except your own) *OPTION*
   * Hide promotions and challenges *OPTION*
   * Hide commutes *OPTION*
 * Responsive layout (mobile support) *OPTION*
 * Detailed Running segments *OPTION*
 * W'balance graphing
 * Analysis graph smoothing


[![intro](https://img.youtube.com/vi/6nR12miKQ98/0.jpg)](https://www.youtube.com/watch?v=6nR12miKQ98)


#### Development:
 1. Clone this repo to your local computer
 2. Run `make`
 3. Go to chrome://extensions/ on your Chrome browser
 4. Make sure "Developer mode" is checked
 5. Click "Load unpacked extension..."
 6. Navigate to the directory  where you cloned or unzipped sauce and click "Open."

#### Mozilla Store QA Instructions:
 1. Get Linux machine with node, npm and make.
 2. `unzip <bundle>.zip`
 3. `cd <bundle dir>`
 4. `TARGET=gecko make`
 5. OPTIONAL: `TARGET=gecko make packages` -> artifacts in build/


Release Notes
--------
https://www.sauce.llc/release_notes


Disclaimer
--------
I don't work for Strava nor have I interacted with any persons from Strava in
the writing of this extension.  All the information used in this extension is
readily available within the Strava.com website.


Attribution
--------
 * <a id="tp"></a> Normalized Power®, NP®, Training Stress Score®, TSS®,
   Intensity Factor®, IF® are trademarks of TrainingPeaks, LLC and are used with permission.

   Learn more at <a href="https://www.trainingpeaks.com/learn/articles/glossary-of-trainingpeaks-metrics/?utm_source=newsletter&utm_medium=partner&utm_term=sauce_trademark&utm_content=cta&utm_campaign=sauce">https://www.trainingpeaks.com/learn/articles/glossary-of-trainingpeaks-metrics/</a>.


Legal
--------
Because lawyers and Google:
[Privacy Policy](https://SauceLLC.github.io/sauce4strava/pages/privacy.html)
