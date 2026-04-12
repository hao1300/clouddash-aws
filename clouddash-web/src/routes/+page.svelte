<script>
  import {
    ZapIcon,
    ShieldIcon,
    CommandIcon,
    ArrowRightIcon,
    CheckCircleIcon,
    MonitorIcon,
    SmartphoneIcon,
  } from "svelte-feather-icons";

  const features = [
    {
      icon: ZapIcon,
      title: "Performance First",
      description:
        "Near-instant navigation through AWS resources with a native-code engine. No more waiting for management console pages to load.",
    },
    {
      icon: ShieldIcon,
      title: "Direct AWS Connection",
      description:
        "Zero middleware. Your credentials and traffic communicate directly with AWS APIs without ever passing through our servers.",
    },
    {
      icon: CommandIcon,
      title: "Native Cross-Platform",
      description:
        "Dedicated, high-performance native apps for your workstation and mobile phone. Manage your AWS resources anywhere.",
    },
  ];

  const platforms = [
    { name: "Windows", status: "Available", isLive: true },
    { name: "Android", status: "Available", isLive: true },
    { name: "MacOS", status: "Coming Soon", isLive: false },
    { name: "iOS", status: "Coming Soon", isLive: false },
  ];
</script>

<!-- Hero Section -->
<section class="hero py-4 overflow-hidden position-relative">
  <div class="container container-max">
    <div class="row align-items-center g-5">
      <div class="col-lg-6 z-1">
        <h1 class="display-2 fw-bold mb-4 font-outfit lh-1 text-white">
          The Ultimate AWS <br />
          <span class="text-gradient">Command Center.</span>
        </h1>

        <p class="lead text-secondary mb-4 pe-lg-5">
          The quickest way to manage your AWS infrastructure across your
          computer and mobile devices. CloudDash is a lightning-fast,
          local-first client designed for modern cloud engineers.
        </p>

        <div class="d-flex flex-wrap gap-3">
          <a
            href="/download"
            class="btn btn-primary btn-lg rounded-pill px-4 py-2 shadow-lg d-flex align-items-center gap-2"
          >
            Get Started <ArrowRightIcon size="18" />
          </a>
          <a
            href="/pricing"
            class="btn btn-dark btn-lg rounded-pill px-4 py-2 border border-gray"
          >
            View Pricing
          </a>
        </div>

        <div class="mt-4 d-flex align-items-center gap-3">
          <div class="d-flex align-items-center gap-2 text-secondary">
            <MonitorIcon size="20" />
            <SmartphoneIcon size="20" />
            <span class="small fw-medium opacity-75 ms-1"
              >Available on Windows & Android</span
            >
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="hero-image-container position-relative">
          <div class="hero-glow"></div>
          <div class="hero-image-wrapper p-2 rounded-5 glass shadow-2xl">
            <img
              src="/screenshots/ec2-metrics.png"
              alt="CloudDash Dashboard"
              class="img-fluid rounded-4 shadow-lg border border-gray"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Features Section -->
<section id="features" class="features py-4 bg-gray-900 bg-opacity-30">
  <div class="container container-max">
    <div class="text-center mb-4">
      <h2 class="display-5 fw-bold font-outfit mb-3 text-white">
        Engineered for Efficiency
      </h2>
      <p class="text-secondary mw-600 mx-auto lead">
        Built from the ground up to replace the heavy management console with a
        native experience.
      </p>
    </div>

    <div class="row g-4 pt-4">
      {#each features as feature}
        <div class="col-md-4">
          <div class="feature-card p-4 rounded-4 h-100 transition-up">
            <div
              class="icon-box bg-primary bg-opacity-10 text-primary p-3 rounded-3 mb-4 d-inline-flex"
            >
              <svelte:component this={feature.icon} size="28" />
            </div>
            <h4 class="fw-bold mb-3 text-white">{feature.title}</h4>
            <p class="text-secondary mb-0">{feature.description}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Platforms Section -->
<section class="platforms py-4">
  <div class="container container-max">
    <div class="row align-items-center g-5">
      <div class="col-lg-5 order-2 order-lg-1">
        <div class="hero-image-container position-relative text-center">
          <div class="hero-glow opacity-50"></div>
          <img
            src="/screenshots/android-sqs-list.jpg"
            alt="CloudDash Android App"
            class="img-fluid rounded-5 shadow-2xl border border-gray position-relative"
            style="max-width: 300px;"
          />
        </div>
      </div>

      <div class="col-lg-7 order-1 order-lg-2">
        <h2 class="display-5 fw-bold font-outfit mb-4 text-white">
          Any Device. Any Time.
        </h2>
        <p class="text-secondary lead mb-4">
          CloudDash provide a consistent management layer across all your
          platforms. Secure your infrastructure from your workstation or while
          on the move.
        </p>

        <div class="row g-3">
          {#each platforms as platform}
            <div class="col-sm-6">
              <div
                class="p-4 rounded-4 border border-gray glass d-flex align-items-center justify-content-between"
              >
                <span class="fw-bold font-outfit text-white h5 mb-0"
                  >{platform.name}</span
                >
                <span
                  class="badge {platform.isLive
                    ? 'bg-primary'
                    : 'bg-dark border border-gray text-secondary'} rounded-pill px-3 py-2"
                >
                  {platform.status}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
<!-- Product Gallery Section -->
<section id="gallery" class="gallery py-4 bg-gray-900 bg-opacity-10">
  <div class="container container-max">
    <div class="text-center mb-4">
      <h2 class="display-5 fw-bold font-outfit mb-3 text-white">
        Experience CloudDash
      </h2>
      <p class="text-secondary mw-600 mx-auto lead">
        A seamless transition between deep desktop analysis and agile mobile
        management.
      </p>
    </div>

    <!-- Desktop Gallery -->
    <div class="mb-4">
      <div class="d-flex align-items-center gap-3 mb-4">
        <div class="bg-primary bg-opacity-10 text-primary p-2 rounded-3">
          <ZapIcon size="20" />
        </div>
        <h3 class="fw-bold h4 mb-0 text-white font-outfit">
          Desktop Excellence
        </h3>
      </div>
      <div class="row g-4">
        <div class="col-lg-8">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/logs-insights.png"
              alt="Logs Insights"
              class="img-fluid"
            />
            <div class="gallery-caption p-3 glass border-top border-gray">
              <span class="text-white small fw-medium"
                >CloudWatch Logs Insights Query</span
              >
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="d-flex flex-column gap-4 h-100">
            <div
              class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up flex-grow-1"
            >
              <img
                src="/screenshots/aws-iam.png"
                alt="IAM Management"
                class="img-fluid h-100 object-fit-cover"
                style="object-position: left center;"
              />
              <div class="gallery-caption p-3 glass border-top border-gray">
                <span class="text-white small fw-medium"
                  >IAM Role & Policy Management</span
                >
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/cloudfront-metrics.png"
              alt="CloudFront Metrics"
              class="img-fluid"
            />
            <div class="gallery-caption p-3 glass border-top border-gray">
              <span class="text-white small fw-medium"
                >CloudFront Analytics</span
              >
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/s3-preview.png"
              alt="S3 Preview"
              class="img-fluid"
            />
            <div class="gallery-caption p-3 glass border-top border-gray">
              <span class="text-white small fw-medium">S3 Object Preview</span>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/cloudwatch-alarms.png"
              alt="CloudWatch Alarms"
              class="img-fluid"
            />
            <div class="gallery-caption p-3 glass border-top border-gray">
              <span class="text-white small fw-medium">Unified Alarms View</span
              >
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/ec2-metrics.png"
              alt="EC2 Metrics"
              class="img-fluid"
            />
            <div class="gallery-caption p-3 glass border-top border-gray">
              <span class="text-white small fw-medium"
                >EC2 Instance Metrics</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Gallery -->
    <div>
      <div class="d-flex align-items-center gap-3 my-4">
        <div class="bg-primary bg-opacity-10 text-primary p-2 rounded-3">
          <ArrowRightIcon size="20" />
        </div>
        <h3 class="fw-bold h4 mb-0 text-white font-outfit">Mobile Agility</h3>
      </div>
      <div class="row g-3">
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-dynamodb-items.jpg"
              alt="DynamoDB Items"
              class="img-fluid"
            />
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-cloudwatch-logs.jpg"
              alt="CloudWatch Logs"
              class="img-fluid"
            />
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-lambda-payloads.jpg"
              alt="Lambda History"
              class="img-fluid"
            />
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-sqs-list.jpg"
              alt="SQS List"
              class="img-fluid"
            />
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-dynamodb-query.jpg"
              alt="DynamoDB Query"
              class="img-fluid"
            />
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div
            class="gallery-item rounded-4 overflow-hidden border border-gray shadow-lg transition-up"
          >
            <img
              src="/screenshots/android-alarm-details.jpg"
              alt="Alarm Details"
              class="img-fluid"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<!-- CTA Section -->
<section class="cta py-4">
  <div class="container container-max">
    <div
      class="cta-banner p-4 rounded-5 text-center position-relative overflow-hidden shadow-2xl"
    >
      <div class="cta-glow"></div>
      <div class="position-relative z-1">
        <h2 class="display-3 fw-bold mb-4 font-outfit text-white">
          Upgrade your AWS experience?
        </h2>
        <p class="lead mb-5 text-secondary mx-auto mw-600">
          The simplest way to manage your cloud infrastructure. Get started
          today and boost your productivity.
        </p>
        <div class="d-flex flex-wrap justify-content-center gap-3">
          <a
            href="/download"
            class="btn btn-primary btn-lg rounded-pill px-4 py-2 shadow-lg fw-bold"
          >
            Download Now
          </a>
          <a
            href="/pricing"
            class="btn btn-outline-light btn-lg rounded-pill px-4 py-2 fw-bold"
          >
            View Pricing
          </a>
        </div>
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

  .hero-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 140%;
    height: 140%;
    background: radial-gradient(
      circle,
      rgba(59, 130, 246, 0.15) 0%,
      transparent 70%
    );
    z-index: 0;
    pointer-events: none;
  }

  .hero-image-wrapper {
    transform: perspective(1000px) rotateY(-5deg) rotateX(2deg);
    transition: transform 0.5s ease;
    position: relative;
    z-index: 1;
  }

  .hero-image-container:hover .hero-image-wrapper {
    transform: perspective(1000px) rotateY(0deg) rotateX(0deg);
  }

  .cta-banner {
    background-color: var(--bg-900);
    border: 1px solid var(--border-gray);
  }

  .cta-glow {
    position: absolute;
    bottom: -100px;
    right: -100px;
    width: 400px;
    height: 400px;
    background: radial-gradient(
      circle,
      rgba(59, 130, 246, 0.1) 0%,
      transparent 70%
    );
    pointer-events: none;
  }

  .gallery-item {
    position: relative;
    background-color: var(--bg-950);
  }

  .gallery-item img {
    transition: transform 0.5s ease;
  }

  .gallery-item:hover img {
    transform: scale(1.02);
  }

  .gallery-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 2;
  }

  .mb-4 {
    margin-bottom: 3rem;
  }

  .object-fit-cover {
    object-fit: cover;
  }
</style>
