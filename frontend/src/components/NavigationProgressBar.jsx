import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

// Configure NProgress with high-performance settings
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 180,
  minimum: 0.18,
  easing: "ease",
  speed: 350,
});

export default function NavigationProgressBar() {
  const location = useLocation();

  useEffect(() => {
    // Start progress on route transition
    NProgress.start();

    // Finish progress bar smoothly
    const timer = setTimeout(() => {
      NProgress.done();
    }, 250);

    return () => {
      clearTimeout(timer);
      NProgress.done();
    };
  }, [location.pathname, location.search]);

  return null;
}
