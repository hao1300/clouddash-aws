<script>
  import { page } from "$app/stores";

  let { children } = $props();

  let isOpen = $state(false);

  $effect(() => {
    // Close menu when navigating to a new page
    $page.url.pathname;
    isOpen = false;
  });
</script>

<nav
  class="navbar navbar-expand-lg py-3 sticky-top glass border-bottom shadow-sm"
>
  <div class="container container-max">
    <div class="d-flex align-items-center">
      <button
        class="navbar-toggler border-0 text-white me-2"
        type="button"
        onclick={() => (isOpen = !isOpen)}
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon shadow-none" style="filter: invert(1);"
        ></span>
      </button>

      <a class="navbar-brand d-flex align-items-center m-0" href="/">
        <div
          class="me-2 rounded-3 d-flex align-items-center justify-content-center"
        >
          <img
            src="/favicon-96x96.png"
            alt="CloudDash"
            width="32"
            height="32"
          />
        </div>
        <span class="fw-bold text-white h4 mb-0 font-outfit">CloudDash</span>
      </a>
    </div>

    <div class="collapse navbar-collapse {isOpen ? 'show' : ''}" id="navbarNav">
      <ul
        class="navbar-nav ms-auto gap-lg-3 mt-3 mt-lg-0 align-items-start align-items-lg-center text-start"
      >
        <li class="nav-item">
          <a
            class="nav-link fw-medium"
            href="/#features"
            onclick={() => (isOpen = false)}>Features</a
          >
        </li>

        <li class="nav-item">
          <a
            class="btn btn-primary rounded-pill px-4 ms-lg-2 shadow-sm fw-bold"
            href="/download"
            onclick={() => (isOpen = false)}>Download</a
          >
        </li>
      </ul>
    </div>
  </div>
</nav>

<main class="flex-grow-1">
  {@render children()}
</main>

<footer class="footer py-4 border-top border-gray mt-auto">
  <div class="container container-max">
    <div class="row g-4">
      <div class="col-lg-4">
        <div class="d-flex align-items-center mb-3">
          <div
            class="me-2 rounded-3 d-flex align-items-center justify-content-center"
          >
            <img
              src="/favicon-96x96.png"
              alt="CloudDash"
              width="32"
              height="32"
            />
          </div>
          <span class="fw-bold text-white font-outfit">CloudDash</span>
        </div>
        <p class="text-secondary small">
          The ultimate AWS management tool for multi-platform access. Simplify
          your AWS console experience across Windows and Android.
        </p>
        <p class="text-secondary small">
          CloudDash is not affiliated with Amazon Web Services.
        </p>
      </div>

      <div class="col-6 col-lg-2 offset-lg-2">
        <h6 class="fw-bold mb-3 font-outfit text-white">Product</h6>
        <ul class="list-unstyled d-grid gap-2">
          <li>
            <a
              href="/#features"
              class="text-secondary text-decoration-none small hover-primary"
              >Features</a
            >
          </li>

          <li>
            <a
              href="/download"
              class="text-secondary text-decoration-none small hover-primary"
              >Download</a
            >
          </li>
        </ul>
      </div>

      <div class="col-6 col-lg-2">
        <h6 class="fw-bold mb-3 font-outfit text-white">Support</h6>
        <ul class="list-unstyled d-grid gap-2">
          <li>
            <a
              href="/contact"
              class="text-secondary text-decoration-none small hover-primary"
              >Contact Us</a
            >
          </li>
          <li>
            <a
              href="/privacy"
              class="text-secondary text-decoration-none small hover-primary"
              >Privacy Policy</a
            >
          </li>
        </ul>
      </div>
    </div>
  </div>
</footer>

<style>
  :global(body) {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-950);
  }

  .container-max {
    max-width: 1200px;
  }

  .nav-link {
    transition: color 0.2s ease;
  }

  .hover-primary:hover {
    color: var(--primary) !important;
  }

  .border-gray {
    border-color: var(--border-gray) !important;
  }

  @media (max-width: 991.98px) {
    .navbar-collapse {
      position: absolute;
      top: 100%;
      left: 0;
      width: 100%;
      background-color: var(--bg-950);
      border-bottom: 1px solid var(--border-gray);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      display: grid !important;
      grid-template-rows: 0fr;
      transition:
        grid-template-rows 0.3s ease-in-out,
        opacity 0.3s ease-in-out;
      opacity: 0;
      visibility: hidden;
      z-index: 1050;
    }

    .navbar-collapse.show {
      grid-template-rows: 1fr;
      opacity: 1;
      visibility: visible;
    }

    .navbar-collapse > ul {
      min-height: 0;
      overflow: hidden;
      margin: 0 !important;
      padding: 0 1rem;
    }

    .navbar-collapse > ul > li:first-child {
      margin-top: 1rem;
    }

    .navbar-collapse > ul > li:last-child {
      margin-bottom: 1.5rem;
    }
  }
</style>
