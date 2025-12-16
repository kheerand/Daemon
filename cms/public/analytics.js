// ULT Real-time Analytics Tracker
// Inspired by Chartbeat - tracks engagement, scroll depth, and time on page
(function() {
  'use strict';
  
  // Configuration
  const BEACON_INTERVAL = 16000; // Send beacon every 16 seconds
  const IDLE_THRESHOLD = 30000; // Consider user idle after 30 seconds of no activity
  const BEACON_ENDPOINT = 'https://ul.live/api/beacon';
  const PAGEVIEW_ENDPOINT = 'https://ul.live/api/pageview';
  
  // State
  let sessionId = generateSessionId();
  let pageViewId = null; // Will be set after initial page view
  let pageLoadTime = Date.now();
  let lastActivityTime = Date.now();
  let isVisible = true;
  let isIdle = false;
  let engagedTime = 0;
  let lastBeaconTime = Date.now();
  let maxScrollDepth = 0;
  let currentScrollDepth = 0;
  let clickedLinks = [];
  let shareActivity = [];
  
  // Get browser info
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    
    if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';
    else if (ua.indexOf('Edge') > -1) browser = 'Edge';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
    
    return browser;
  }
  
  // Get OS info
  function getOSInfo() {
    const ua = navigator.userAgent;
    let os = 'Unknown';
    
    if (ua.indexOf('Windows') > -1) os = 'Windows';
    else if (ua.indexOf('Mac') > -1) os = 'macOS';
    else if (ua.indexOf('Linux') > -1) os = 'Linux';
    else if (ua.indexOf('Android') > -1) os = 'Android';
    else if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) os = 'iOS';
    
    return os;
  }
  
  // Note: Source classification moved to server-side classifySource() function
  // Server has more comprehensive classification and access to raw referrer

  // Get UTM parameters from URL
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    
    // Standard UTM parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
      if (params.has(param)) {
        utm[param] = params.get(param);
      }
    });
    
    // Also check for common variations
    if (params.has('source')) utm.utm_source = utm.utm_source || params.get('source');
    if (params.has('ref')) utm.utm_source = utm.utm_source || params.get('ref');
    
    return Object.keys(utm).length > 0 ? utm : null;
  }
  
  // Page data
  const pageData = {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    // Server handles source classification based on raw referrer
    utmParams: getUTMParams(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    browser: getBrowserInfo(),
    os: getOSInfo(),
    userAgent: navigator.userAgent,
    language: navigator.language || navigator.userLanguage,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  
  // Generate unique session ID
  function generateSessionId() {
    return 'ult_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  // Calculate scroll depth
  function calculateScrollDepth() {
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    const winHeight = window.innerHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (docHeight <= winHeight) {
      return 100; // Page fits in viewport
    }
    
    const scrollableHeight = docHeight - winHeight;
    const scrollPercentage = Math.round((scrollTop / scrollableHeight) * 100);
    return Math.min(100, Math.max(0, scrollPercentage));
  }
  
  // Update activity tracking
  function updateActivity() {
    lastActivityTime = Date.now();
    if (isIdle) {
      isIdle = false;
    }
  }
  
  // Track engagement time
  function updateEngagementTime() {
    if (!isIdle && isVisible) {
      const now = Date.now();
      const timeSinceLastBeacon = now - lastBeaconTime;
      engagedTime += timeSinceLastBeacon;
      lastBeaconTime = now;
    }
  }
  
  // Send initial page view to get pageViewId
  function sendPageView() {
    const pageViewData = {
      sessionId: sessionId,
      page: {
        url: pageData.url,
        title: pageData.title,
        referrer: pageData.referrer
      },
      device: {
        browser: pageData.browser,
        os: pageData.os,
        userAgent: pageData.userAgent,
        screenWidth: pageData.screenWidth,
        screenHeight: pageData.screenHeight
      },
      context: pageData.utmParams || {}
    };
    
    fetch(PAGEVIEW_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(pageViewData),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.pageViewId) {
        pageViewId = data.pageViewId;
        console.log('ULT Analytics: Page view recorded, ID:', pageViewId);
      }
    })
    .catch(err => {
      console.error('ULT Analytics: Failed to record page view:', err);
    });
  }
  
  // Send beacon to server
  function sendBeacon() {
    // Don't send beacon if we don't have a pageViewId yet
    if (!pageViewId) {
      console.log('ULT Analytics: Skipping beacon - no pageViewId yet');
      return;
    }
    
    updateEngagementTime();
    
    const now = Date.now();
    const timeOnPage = Math.floor((now - pageLoadTime) / 1000); // in seconds
    const engagedSeconds = Math.floor(engagedTime / 1000);
    
    const beaconData = {
      pageViewId: pageViewId, // REQUIRED - reference to the page view
      sessionId: sessionId,
      timestamp: now,
      metrics: {
        timeOnPage: timeOnPage,
        engagedTime: engagedSeconds,
        scrollDepth: currentScrollDepth,
        maxScrollDepth: maxScrollDepth,
        isVisible: isVisible,
        isIdle: isIdle,
        isEngaged: !isIdle && isVisible
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      interactions: {
        clickedLinks: clickedLinks.slice(-10), // Last 10 clicked links
        shareActivity: shareActivity.slice(-5) // Last 5 share activities
      }
    };
    
    // Use sendBeacon API if available, otherwise use fetch
    if (navigator.sendBeacon) {
      navigator.sendBeacon(BEACON_ENDPOINT, JSON.stringify(beaconData));
    } else {
      fetch(BEACON_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(beaconData),
        headers: {
          'Content-Type': 'application/json'
        },
        keepalive: true
      }).catch(() => {}); // Silently fail
    }
  }
  
  // Check if user is idle
  function checkIdleState() {
    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime;
    
    if (timeSinceActivity > IDLE_THRESHOLD && !isIdle) {
      isIdle = true;
    } else if (timeSinceActivity <= IDLE_THRESHOLD && isIdle) {
      isIdle = false;
    }
  }
  
  // Event listeners
  
  // Track mouse movement
  let mouseMoveThrottle;
  document.addEventListener('mousemove', function() {
    if (!mouseMoveThrottle) {
      updateActivity();
      mouseMoveThrottle = setTimeout(() => {
        mouseMoveThrottle = null;
      }, 1000);
    }
  });
  
  // Track keyboard activity
  document.addEventListener('keypress', updateActivity);
  
  // Track scrolling
  let scrollThrottle;
  window.addEventListener('scroll', function() {
    updateActivity();
    if (!scrollThrottle) {
      scrollThrottle = setTimeout(() => {
        currentScrollDepth = calculateScrollDepth();
        maxScrollDepth = Math.max(maxScrollDepth, currentScrollDepth);
        scrollThrottle = null;
      }, 100);
    }
  });
  
  // Track clicks and link interactions
  document.addEventListener('click', function(e) {
    updateActivity();
    
    // Track link clicks
    const link = e.target.closest('a');
    if (link && link.href) {
      const linkData = {
        url: link.href,
        text: link.textContent.trim().substring(0, 50),
        timestamp: Date.now()
      };
      clickedLinks.push(linkData);
      
      // CRITICAL: If it's an internal link, immediately trigger page tracking
      // This ensures we catch SPA navigation that might not trigger other events
      try {
        const linkUrl = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        // Check if it's an internal navigation (same host)
        if (linkUrl.hostname === currentUrl.hostname && linkUrl.pathname !== currentUrl.pathname) {
          console.log('ULT Analytics: Internal link click detected, will track page change');
          // Give the browser a moment to update the URL, then check for page change
          setTimeout(function() {
            if (window.location.href !== lastTrackedUrl) {
              console.log('ULT Analytics: URL changed after link click, tracking page view');
              trackPageChange();
            }
          }, 50);
        }
      } catch (e) {
        // Invalid URL, ignore
      }
      
      // Check if it's a share button
      if (link.href.includes('share') || 
          link.href.includes('twitter.com/intent') || 
          link.href.includes('facebook.com/sharer') ||
          link.href.includes('linkedin.com/sharing') ||
          link.href.includes('reddit.com/submit') ||
          link.href.includes('mailto:')) {
        shareActivity.push({
          type: detectShareType(link.href),
          timestamp: Date.now(),
          page: window.location.pathname
        });
      }
    }
  });
  
  document.addEventListener('touchstart', updateActivity);
  
  // Detect share type from URL
  function detectShareType(url) {
    if (url.includes('twitter.com') || url.includes('/x?')) return 'twitter';
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('linkedin.com')) return 'linkedin';
    if (url.includes('reddit.com')) return 'reddit';
    if (url.includes('mailto:')) return 'email';
    if (url.includes('hn?')) return 'hackernews';
    return 'other';
  }
  
  // Track page visibility
  document.addEventListener('visibilitychange', function() {
    isVisible = !document.hidden;
    if (isVisible) {
      lastBeaconTime = Date.now(); // Reset beacon time when page becomes visible
      updateActivity();
    }
  });
  
  // Track window focus
  window.addEventListener('focus', function() {
    updateActivity();
  });
  
  window.addEventListener('blur', function() {
    // Don't immediately mark as idle, but stop engagement tracking
  });
  
  // Track navigation like Fathom/GA - Handle both SPA and traditional navigation
  let lastTrackedUrl = window.location.href;
  let previousUrl = document.referrer || ''; // Store the previous URL for internal navigation
  let initialPageViewSent = false; // Flag to prevent duplicate initial page view
  let pageViewInProgress = false; // Flag to prevent concurrent page view sends
  
  // Function to track a new page view when URL changes
  function trackPageChange(isInitialLoad = false) {
    const currentUrl = window.location.href;
    // Skip if this is not the initial load and URL hasn't changed
    if (!isInitialLoad && currentUrl === lastTrackedUrl) {
      return;
    }
    // Prevent duplicate tracking on page load
    if (isInitialLoad && initialPageViewSent) {
      return;
    }
    // Prevent concurrent page view sends
    if (pageViewInProgress) {
      console.log('ULT Analytics: Page view already in progress, skipping');
      return;
    }
    if (currentUrl !== lastTrackedUrl || isInitialLoad) {
      pageViewInProgress = true;
      console.log('ULT Analytics: URL changed, sending new page view...');
      
      // For internal navigation, use the last tracked URL as the referrer
      const isInternalNavigation = lastTrackedUrl.includes(window.location.hostname);
      if (isInternalNavigation) {
        previousUrl = lastTrackedUrl; // Store the previous page as referrer
      }
      
      lastTrackedUrl = currentUrl;
      
      // Reset tracking state for new page
      pageLoadTime = Date.now();
      lastActivityTime = Date.now();
      engagedTime = 0;
      lastBeaconTime = Date.now();
      maxScrollDepth = 0;
      currentScrollDepth = calculateScrollDepth();
      clickedLinks = [];
      shareActivity = [];
      isIdle = false;
      
      // Update page data
      pageData.url = window.location.href;
      
      // CRITICAL FIX: Wait for title to actually change during SPA navigation
      // Store the old title to detect when it changes
      const oldTitle = document.title;
      
      // Function to capture and send page view once title is ready
      function capturePageView() {
        pageData.title = document.title;
        // Use our tracked previous URL for internal navigation, otherwise use document.referrer
        pageData.referrer = previousUrl || document.referrer;
        // Server handles source classification based on raw referrer

        console.log('ULT Analytics: Captured title:', pageData.title);
        
        // Send new page view
        sendPageView();
        // Reset the flag after a short delay
        setTimeout(() => {
          pageViewInProgress = false;
        }, 100);
      }
      
      // If title already changed, send immediately
      if (document.title !== oldTitle && document.title !== '' && document.title !== 'Loading...') {
        capturePageView();
      } else {
        // Otherwise wait for title to change with a MutationObserver
        let titleCaptured = false;
        const titleObserver = new MutationObserver(function(mutations) {
          if (document.title !== oldTitle && document.title !== '' && document.title !== 'Loading...' && !titleCaptured) {
            titleCaptured = true;
            titleObserver.disconnect();
            capturePageView();
          }
        });
        
        // Watch for title changes - safely handle if title element doesn't exist yet
        const titleElement = document.querySelector('title');
        if (titleElement) {
          titleObserver.observe(titleElement, {
            childList: true,
            characterData: true,
            subtree: true
          });
        }
        
        // Also watch head for title element changes
        titleObserver.observe(document.head, {
          childList: true,
          subtree: true
        });
        
        // Fallback: if title hasn't changed after 2 seconds, send with current title
        setTimeout(function() {
          if (!titleCaptured) {
            titleCaptured = true;
            titleObserver.disconnect();
            console.log('ULT Analytics: Title timeout, using current title');
            capturePageView();
          }
          // Reset the flag after timeout
          setTimeout(() => {
            pageViewInProgress = false;
          }, 100);
        }, 2000);
      }
    }
  }
  
  // Listen for browser back/forward navigation
  window.addEventListener('popstate', trackPageChange);
  
  // Listen for programmatic navigation (History API)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(trackPageChange, 0);
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(trackPageChange, 0);
  };
  
  // Listen for hash changes
  window.addEventListener('hashchange', trackPageChange);
  
  // CRITICAL: Also watch for ANY URL changes via MutationObserver (catches all navigation types)
  const urlObserver = new MutationObserver(function() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastTrackedUrl) {
      console.log('ULT Analytics: MutationObserver detected URL change');
      trackPageChange();
    }
  });
  
  // Start observing the document for any changes - with a delay to avoid initial false positives
  setTimeout(function() {
    urlObserver.observe(document, {
      childList: true,
      subtree: true
    });
  }, 100);
  
  // Also poll for URL changes as a fallback (catches everything) - with initial delay
  setTimeout(function() {
    setInterval(function() {
      const currentUrl = window.location.href;
      if (currentUrl !== lastTrackedUrl) {
        console.log('ULT Analytics: Polling detected URL change');
        trackPageChange();
      }
    }, 1000); // Check every second
  }, 500); // Start polling after 500ms delay
  
  // Send initial page view - CRITICAL FIX: Must call sendPageView() not sendBeacon()
  console.log('ULT Analytics: Sending initial page view...');
  initialPageViewSent = true;
  pageViewInProgress = true;
  sendPageView();
  // Update lastTrackedUrl to ensure polling doesn't double-track
  lastTrackedUrl = window.location.href;
  setTimeout(() => {
    pageViewInProgress = false;
  }, 100);
  
  // Regular beacon interval
  setInterval(function() {
    checkIdleState();
    sendBeacon();
  }, BEACON_INTERVAL);
  
  // Send final beacon when page unloads
  window.addEventListener('beforeunload', function() {
    updateEngagementTime();
    sendBeacon();
  });
  
  // Also try pagehide for mobile browsers
  window.addEventListener('pagehide', function() {
    updateEngagementTime();
    sendBeacon();
  });
  
  // Calculate initial scroll depth
  currentScrollDepth = calculateScrollDepth();
  maxScrollDepth = currentScrollDepth;
  
  // Expose analytics object for debugging
  window.ULTAnalytics = {
    sessionId: sessionId,
    getEngagedTime: function() { return Math.floor(engagedTime / 1000); },
    getScrollDepth: function() { return currentScrollDepth; },
    isEngaged: function() { return !isIdle && isVisible; },
    forceBeacon: sendBeacon
  };
})();// Force rebuild Fri Aug 22 11:38:00 PDT 2025
