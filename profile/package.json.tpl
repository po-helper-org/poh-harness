{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "@deepseek-ai/dsh-base": "__HARNESS_VERSION__",
    "@deepseek-ai/dsh-web-app": "__HARNESS_VERSION__",
    __PLUGIN_DEPS__
  },
  "dsh": {
    "profile": {
      "bundles": [
        __BUNDLES__
      ],
      "patchReload": "live"
    }
  }
}
