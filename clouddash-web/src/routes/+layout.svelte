<script>
  import { onMount } from 'svelte';

  let { children } = $props();

  let scrolled = $state(false);

  onMount(() => {
    const handleScroll = () => {
      scrolled = window.scrollY > 20;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<nav
  class="navbar navbar-expand-lg py-3 sticky-top {scrolled ? 'glass border-bottom shadow-sm' : ''}"
>
  <div class="container container-max">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <div class="me-2 rounded-3 d-flex align-items-center justify-content-center">
        <img src="/favicon-96x96.png" alt="CloudDash" width="32" height="32" />
      </div>
      <span class="fw-bold text-white h4 mb-0 font-outfit">CloudDash</span>
    </a>

    <button
      class="navbar-toggler border-0 text-white"
      type="button"
      data-bs-toggle="collapse"
      data-bs-target="#navbarNav"
      aria-label="Toggle navigation"
    >
      <span class="navbar-toggler-icon shadow-none" style="filter: invert(1);"></span>
    </button>

    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav ms-auto gap-lg-3 mt-3 mt-lg-0 align-items-lg-center">
        <li class="nav-item">
          <a class="nav-link fw-medium" href="/#features">Features</a>
        </li>
        <li class="nav-item">
          <a class="nav-link fw-medium" href="/pricing">Pricing</a>
        </li>
        <li class="nav-item">
          <a class="btn btn-primary rounded-pill px-4 ms-lg-2 shadow-sm fw-bold" href="/download"
            >Download</a
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
          <div class="me-2 rounded-3 d-flex align-items-center justify-content-center">
            <img src="/favicon-96x96.png" alt="CloudDash" width="32" height="32" />
          </div>
          <span class="fw-bold text-white font-outfit">CloudDash</span>
        </div>
        <p class="text-secondary small">
          The ultimate AWS management tool for multi-platform access. Simplify your AWS console
          experience across Windows and Android.
        </p>
        <p class="text-secondary small">CloudDash is not affiliated with Amazon Web Services.</p>
      </div>

      <div class="col-6 col-lg-2 offset-lg-2">
        <h6 class="fw-bold mb-3 font-outfit text-white">Product</h6>
        <ul class="list-unstyled d-grid gap-2">
          <li>
            <a href="/#features" class="text-secondary text-decoration-none small hover-primary"
              >Features</a
            >
          </li>
          <li>
            <a href="/pricing" class="text-secondary text-decoration-none small hover-primary"
              >Pricing</a
            >
          </li>
          <li>
            <a href="/download" class="text-secondary text-decoration-none small hover-primary"
              >Download</a
            >
          </li>
        </ul>
      </div>

      <div class="col-6 col-lg-2">
        <h6 class="fw-bold mb-3 font-outfit text-white">Support</h6>
        <ul class="list-unstyled d-grid gap-2">
          <li>
            <a href="/contact" class="text-secondary text-decoration-none small hover-primary"
              >Contact Us</a
            >
          </li>
          <li>
            <a href="/privacy" class="text-secondary text-decoration-none small hover-primary"
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
</style>
