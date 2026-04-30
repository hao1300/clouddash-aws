<script>
  import { CheckIcon, ZapIcon, StarIcon } from "svelte-feather-icons";

  const freeFeatures = [
    "Unlimited AWS Accounts",
    "Read-only: S3, DynamoDB, CloudWatch",
    "Best Effort Support",
  ];

  const proFeatures = [
    "Everything in Free",
    "Read-Write: 10+ AWS Services",
    "Priority Email Support",
  ];
</script>

<section class="pricing-header py-4">
  <div class="container container-max text-center">
    <div
      class="mb-4 d-inline-flex align-items-center gap-2 bg-primary bg-opacity-10 px-3 py-1 rounded-pill border border-primary border-opacity-20"
    >
      <StarIcon size="14" class="text-primary" />
      <span class="text-primary fw-bold small">Enterprise-grade Security</span>
    </div>
    <h1 class="display-3 fw-bold mb-3 font-outfit mt-4 text-white">
      Simple, Transparent <span class="text-gradient">Pricing.</span>
    </h1>
    <p class="lead text-secondary mw-600 mx-auto mb-4">
      One license for all your devices. Experience the ultimate AWS management
      suite with a plan that scales with you.
    </p>
  </div>
</section>

<section class="pricing-plans pb-4">
  <div class="container container-max">
    <div class="row g-4 justify-content-center align-items-stretch">
      <!-- Free Plan -->
      <div class="col-lg-4">
        <div
          class="pricing-card p-4 rounded-5 h-100 transition-up d-flex flex-column"
        >
          <div class="mb-4">
            <h3 class="fw-bold h4 mb-2 text-white font-outfit">Community</h3>
            <p class="text-secondary small">
              Perfect for beginners and hobbyists exploration.
            </p>
          </div>
          <div class="price mb-4">
            <span class="display-4 fw-bold font-outfit text-white">$0</span>
            <span class="text-secondary">/year</span>
          </div>
          <div class="features mt-auto">
            <p
              class="fw-bold mb-3 small text-uppercase text-secondary tracking-wider"
            >
              Features:
            </p>
            <ul class="list-unstyled d-grid gap-3 mb-0">
              {#each freeFeatures as feature}
                <li
                  class="d-flex align-items-center gap-3 small text-secondary"
                >
                  <div class="text-muted"><CheckIcon size="16" /></div>
                  {feature}
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>

      <!-- Pro Plan -->
      <div class="col-lg-5">
        <div
          class="pricing-card p-4 rounded-5 h-100 transition-up position-relative overflow-hidden border border-primary border-opacity-30 d-flex flex-column bg-gradient-dark"
        >
          <div class="popular-badge">Recommended</div>
          <div class="mb-4">
            <div class="d-flex align-items-center gap-2 mb-2">
              <h3 class="fw-bold h4 mb-0 text-white font-outfit">
                Professional
              </h3>
              <div class="text-primary"><ZapIcon size="20" /></div>
            </div>
            <p class="text-secondary small">
              For professional cloud engineers who need full write access.
            </p>
          </div>
          <div class="price mb-2">
            <span class="display-4 fw-bold font-outfit text-white">$36</span>
            <span class="text-secondary">/year</span>
          </div>
          <div class="mb-4">
            <span
              class="badge bg-warning text-dark px-3 py-2 rounded-pill fw-bold shadow-sm"
              >Just $3 / month</span
            >
          </div>
          <a
            href="https://buy.polar.sh/polar_cl_kHwh8kO829ikhkxymHPo2G2PD195xw0UIXvyD0Yhn11"
            class="btn btn-primary btn-lg w-100 rounded-pill fw-bold shadow-lg mb-4"
          >
            Upgrade
          </a>
          <div class="features mt-auto">
            <p
              class="fw-bold mb-3 small text-uppercase text-secondary tracking-wider"
            >
              Everything in Free, plus:
            </p>
            <ul class="list-unstyled d-grid gap-3 mb-0">
              {#each proFeatures as feature}
                <li
                  class="d-flex align-items-center gap-3 small text-white fw-medium"
                >
                  <div class="text-primary"><CheckIcon size="16" /></div>
                  {feature}
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ Section -->
<section class="faq mt-4 py-4 border-top border-gray">
  <div class="container container-max">
    <div class="text-center mb-4">
      <h2 class="fw-bold font-outfit text-white display-5 mb-4">
        Frequently Asked Questions
      </h2>
    </div>
    <div class="row g-4 justify-content-center">
      <div class="col-md-4">
        <div class="p-4 glass rounded-4 h-100">
          <h5 class="fw-bold mb-3 text-white">Is the app secure to use?</h5>
          <p class="text-secondary mb-0">
            Absolutely! You login directly using your own IAM access key and secret. To minimize risk, you can create a dedicated IAM user with limited read-only access. Your credentials are fully managed locally and never sent to any external servers.
          </p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="p-4 glass rounded-4 h-100">
          <h5 class="fw-bold mb-3 text-white">Does Pro work on all devices?</h5>
          <p class="text-secondary mb-0">
            Yes! One Pro subscription covers all platforms. More platform
            supports are coming soon.
          </p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="p-4 glass rounded-4 h-100">
          <h5 class="fw-bold mb-3 text-white">How do I receive my license?</h5>
          <p class="text-secondary mb-0">
            Immediately after purchase, you will receive an email with your
            license key. Simply enter it into the Settings menu of the app to
            activate your Pro features.
          </p>
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

  .bg-gradient-dark {
    background: linear-gradient(145deg, var(--bg-900) 0%, #0c111d 100%);
  }

  .popular-badge {
    position: absolute;
    top: 2rem;
    right: -3rem;
    background-color: var(--primary);
    color: #fff;
    padding: 0.5rem 4rem;
    transform: rotate(45deg);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .tracking-wider {
    letter-spacing: 0.05em;
  }

  .glass {
    border: 1px solid var(--border-gray);
  }
</style>
