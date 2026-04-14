<script>
  import {
    MonitorIcon,
    SmartphoneIcon,
    DownloadIcon,
    ShieldIcon,
    ZapIcon,
    UsersIcon,
    CheckCircleIcon,
    PlayIcon,
  } from "svelte-feather-icons";

  const downloads = [
    {
      name: "Windows",
      icon: MonitorIcon,
      type: "Desktop App",
      link: "https://static.clouddash.dev/downloads/window/CloudDash%20AWS_0.8.1_x64-setup.exe",
      instructions:
        "Stable installer for Windows 10/11. Includes auto-updates and system tray support.",
    },
    {
      name: "Android",
      icon: SmartphoneIcon,
      type: "Mobile APK",
      link: "https://static.clouddash.dev/downloads/android/clouddash_0.8.1.apk",
      instructions:
        "Direct download for Android devices. Optimized for tablets and foldable phones.",
    },
  ];

  const upcoming = [
    { name: "MacOS", icon: MonitorIcon },
    { name: "iOS", icon: SmartphoneIcon },
    { name: "Linux", icon: MonitorIcon },
  ];
</script>

<section class="download-header py-4 text-center">
  <div class="container container-max">
    <div
      class="mb-4 d-inline-flex align-items-center gap-2 bg-primary bg-opacity-10 px-3 py-1 rounded-pill border border-primary border-opacity-20"
    >
      <ZapIcon size="14" class="text-primary" />
      <span class="text-primary fw-bold small"
        >High Performance Native Apps</span
      >
    </div>
    <h1
      class="display-3 fw-bold mb-3 font-outfit mt-4 text-white text-center w-100"
    >
      Download <span class="text-gradient">CloudDash</span>
    </h1>
    <p class="lead text-secondary mw-600 mx-auto mb-4 text-center">
      The fastest, most secure way to manage your AWS infrastructure. Native
      performance on every platform you use.
    </p>
  </div>
</section>

<section class="download-options pb-4">
  <div class="container container-max">
    <div class="row g-4 justify-content-center">
      {#each downloads as dl}
        <div class="col-lg-5">
          <div
            class="pricing-card p-4 rounded-5 h-100 transition-up d-flex flex-column border border-gray"
          >
            <div class="d-flex align-items-center gap-3 mb-4">
              <div
                class="icon-box bg-primary bg-opacity-10 text-primary p-3 rounded-4 border border-primary border-opacity-20"
              >
                <svelte:component this={dl.icon} size="32" />
              </div>
              <div>
                <h3 class="fw-bold h4 mb-0 text-white font-outfit">
                  {dl.name}
                </h3>
                <span class="text-secondary small">{dl.type}</span>
              </div>
            </div>

            <p class="text-secondary mb-4 flex-grow-1">{dl.instructions}</p>

            <a
              href={dl.link}
              class="btn btn-primary btn-lg w-100 rounded-pill fw-bold shadow-lg d-flex align-items-center justify-content-center gap-2"
            >
              <DownloadIcon size="20" />
              Download for {dl.name}
            </a>
          </div>
        </div>
      {/each}
    </div>

    <!-- Beta Section -->
    <div class="mt-5">
      <div
        class="p-4 p-md-5 rounded-5 glass border border-primary border-opacity-20 position-relative overflow-hidden"
      >
        <div class="position-absolute top-0 end-0 p-4 opacity-10 d-none d-md-block">
          <SmartphoneIcon size="160" />
        </div>
        <div class="row">
          <div class="col-lg-8">
            <div
              class="badge bg-primary bg-opacity-10 text-primary mb-3 px-3 py-2 rounded-pill border border-primary border-opacity-20"
            >
              Android Closed Beta
            </div>
            <h2 class="display-6 fw-bold text-white mb-4 font-outfit">
              Get it on Google Play
            </h2>
            <p class="lead text-secondary mb-5">
              We're currently in closed beta testing on Android. Join our community
              to get the latest updates directly through the Play Store.
            </p>

            <div class="row g-4">
              <div class="col-md-4">
                <div class="d-flex flex-column h-100">
                  <div
                    class="step-num mb-3 bg-primary text-white fw-bold rounded-circle d-flex align-items-center justify-content-center"
                    style="width: 32px; height: 32px;"
                  >
                    1
                  </div>
                  <h5 class="text-white font-outfit mb-2">Join Group</h5>
                  <p class="text-secondary small mb-3 flex-grow-1">
                    Join our Google Group to be whitelisted for the beta.
                  </p>
                  <a
                    href="https://groups.google.com/g/clouddash-testers"
                    target="_blank"
                    class="btn btn-sm btn-outline-primary rounded-pill w-fit"
                  >
                    Join Testers <UsersIcon size="12" class="ms-1" />
                  </a>
                </div>
              </div>
              <div class="col-md-4">
                <div class="d-flex flex-column h-100">
                  <div
                    class="step-num mb-3 bg-primary text-white fw-bold rounded-circle d-flex align-items-center justify-content-center"
                    style="width: 32px; height: 32px;"
                  >
                    2
                  </div>
                  <h5 class="text-white font-outfit mb-2">Opt-in</h5>
                  <p class="text-secondary small mb-3 flex-grow-1">
                    Accept the testing invitation on the Play Store web portal.
                  </p>
                  <a
                    href="https://play.google.com/apps/testing/dev.clouddash.aws"
                    target="_blank"
                    class="btn btn-sm btn-outline-primary rounded-pill w-fit"
                  >
                    Opt-in <CheckCircleIcon size="12" class="ms-1" />
                  </a>
                </div>
              </div>
              <div class="col-md-4">
                <div class="d-flex flex-column h-100">
                  <div
                    class="step-num mb-3 bg-primary text-white fw-bold rounded-circle d-flex align-items-center justify-content-center"
                    style="width: 32px; height: 32px;"
                  >
                    3
                  </div>
                  <h5 class="text-white font-outfit mb-2">Download</h5>
                  <p class="text-secondary small mb-3 flex-grow-1">
                    Download and install the app from the Google Play Store.
                  </p>
                  <a
                    href="https://play.google.com/store/apps/details?id=dev.clouddash.aws"
                    target="_blank"
                    class="btn btn-sm btn-primary rounded-pill w-fit px-3"
                  >
                    Get App <PlayIcon size="12" class="ms-1" />
                  </a>
                </div>
              </div>
            </div>

            <!-- Tester Bonus -->
            <div
              class="mt-5 p-3 rounded-4 bg-primary bg-opacity-10 border border-primary border-opacity-20 d-flex align-items-center gap-3"
            >
              <div
                class="bg-primary text-white p-2 rounded-3 d-flex align-items-center justify-content-center"
              >
                <ZapIcon size="20" />
              </div>
              <div>
                <span class="text-white fw-bold d-block">Tester Bonus: Free PRO Access</span>
                <span class="text-secondary small">
                  Enter code <code class="text-primary fw-bold mx-1">CLOUDDASHTESTER</code> in the app to unlock all features.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Coming Soon Section -->
    <div class="mt-4 pt-4 border-top border-gray">
      <div class="text-center mb-4">
        <h2 class="fw-bold font-outfit text-white h3 mb-2">
          Expansion in Progress
        </h2>
        <p class="text-secondary small lead">
          Universal coverage for all your dev environments.
        </p>
      </div>

      <div class="row g-3 justify-content-center">
        {#each upcoming as platform}
          <div class="col-6 col-md-3">
            <div class="p-4 rounded-4 glass text-center opacity-75">
              <div class="text-secondary mb-3">
                <svelte:component this={platform.icon} size="24" />
              </div>
              <span class="fw-bold font-outfit d-block mb-1 text-white"
                >{platform.name}</span
              >
              <span
                class="badge bg-dark border border-gray rounded-pill px-3 py-1 small text-secondary"
                >Planned</span
              >
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .text-gradient {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .mw-600 {
    max-width: 600px;
  }

  .glass {
    border: 1px solid var(--border-gray);
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
  }

  .w-fit {
    width: fit-content;
  }

  .transition-up:hover {
    transform: translateY(-5px);
    border-color: rgba(59, 130, 246, 0.5) !important;
  }
</style>
