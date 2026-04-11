const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# expo-swift-concurrency-applied";

const INJECTION = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
      config.build_settings['SWIFT_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 12.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end
`;

function insertBeforePostInstallEnd(podfile) {
  const lines = podfile.split("\n");
  let inPostInstall = false;
  let depth = 0;
  let insertAt = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!inPostInstall && trimmed.includes("post_install do |installer|")) {
      inPostInstall = true;
      depth = 1;
      continue;
    }

    if (inPostInstall) {
      if (/\bdo\b\s*(\|[^|]*\|)?\s*$/.test(trimmed) ||
          /^(if|unless|while|until|for|def|class|module|begin)\b/.test(trimmed)) {
        depth++;
      }
      if (trimmed === "end" || /^end\s*(#.*)?$/.test(trimmed)) {
        depth--;
        if (depth === 0) {
          insertAt = i;
          break;
        }
      }
    }
  }

  if (insertAt === -1) return null;
  lines.splice(insertAt, 0, INJECTION);
  return lines.join("\n");
}

module.exports = function withSwiftConcurrencyMinimal(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      if (podfile.includes(MARKER)) {
        console.log("ℹ️ Plugin already applied, skipping");
        return config;
      }

      if (podfile.includes("post_install do |installer|")) {
        const patched = insertBeforePostInstallEnd(podfile);
        if (patched) {
          fs.writeFileSync(podfilePath, patched);
          console.log("✅ Plugin applied: injected before post_install end");
        } else {
          console.warn("⚠️ Could not find closing end of post_install");
        }
      } else {
        const newBlock = `\npost_install do |installer|\n${INJECTION}end\n`;
        fs.writeFileSync(podfilePath, podfile + newBlock);
        console.log("✅ Plugin applied: created new post_install block");
      }

      return config;
    },
  ]);
};
