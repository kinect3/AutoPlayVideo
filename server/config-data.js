    // this is the file i update when netflix change their site for global push
const SITE_CONFIG = {
  version: "1.0.0",
  timestamp: new Date().toISOString(),
  platforms: {
    netflix: {
      playerContainer: ".nfp-chrome-player-layer",
      // The button ID usually found during credits
      nextButton: "[data-uia='next-episode-seamless-button']",
      skipIntroButton: "[data-uia='player-skip-intro']"
    },
    youtube: {
      playerContainer: "#movie_player",
      // Multiple fallbacks for YouTube's ad skip button
      skipAdButton: ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton",
      autonavScreen: ".ytp-autonav-endscreen-countdown-overlay"
    }
  }
};

module.exports = SITE_CONFIG;