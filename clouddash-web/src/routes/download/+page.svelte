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
      link: "https://static.clouddash.dev/downloads/windows/clouddash-0.9.3-setup.exe",
      instructions:
        "Stable installer for Windows 10/11. Includes auto-updates and system tray support.",
    },
    {
      name: "Android",
      icon: SmartphoneIcon,
      type: "Google Play / APK",
      playStoreLink:
        "https://play.google.com/store/apps/details?id=dev.clouddash.aws",
      link: "https://static.clouddash.dev/downloads/android/clouddash-0.9.3.apk",
      instructions:
        "Available on the Google Play Store. Direct APK available as backup.",
    },
    {
      name: "Linux",
      icon: MonitorIcon,
      type: "AppImage",
      link: "https://static.clouddash.dev/downloads/linux/clouddash-0.9.3.AppImage",
      instructions:
        "Universal Linux AppImage. Supports most distributions including Ubuntu, Fedora, and Debian.",
    },
  ];

  const upcoming = [
    { name: "MacOS", icon: MonitorIcon },
    { name: "iOS", icon: SmartphoneIcon },
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

            {#if dl.playStoreLink}
              <div class="d-flex flex-column gap-3">
                <a
                  href={dl.playStoreLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="play-store-badge transition-up"
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
                    alt="Get it on Google Play"
                    class="w-100"
                  />
                </a>
                <a
                  href={dl.link}
                  class="text-secondary small text-center text-decoration-underline"
                >
                  Download APK
                </a>
              </div>
            {:else}
              <a
                href={dl.link}
                class="btn btn-primary btn-lg w-100 rounded-pill fw-bold shadow-lg d-flex align-items-center justify-content-center gap-2"
              >
                <DownloadIcon size="20" />
                Download for {dl.name}
              </a>
            {/if}
          </div>
        </div>
      {/each}
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

  .play-store-badge {
    display: block;
    max-width: 200px;
    margin: 0 auto;
    transition: transform 0.2s ease;
  }

  .play-store-badge img {
    height: 60px;
    width: auto;
  }
</style>
