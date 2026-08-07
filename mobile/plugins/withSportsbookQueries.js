const { withAndroidManifest } = require("expo/config-plugins");

// Android 11+ (API 30+) hides other apps' package visibility unless declared
// in a <queries> block, which breaks Linking.canOpenURL for the sportsbook
// deep links used by the "Send to Sportsbook" feature. This registers the
// packages we need to query.
const SPORTSBOOK_PACKAGES = ["com.fanduel.sportsbook", "com.draftkings.sportsbook"];

function withSportsbookQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const queries = manifest.queries[0];
    if (!queries.package) {
      queries.package = [];
    }
    for (const packageName of SPORTSBOOK_PACKAGES) {
      const alreadyPresent = queries.package.some(
        (entry) => entry.$["android:name"] === packageName,
      );
      if (!alreadyPresent) {
        queries.package.push({ $: { "android:name": packageName } });
      }
    }
    return config;
  });
}

module.exports = withSportsbookQueries;
