// ==UserScript==
// @name         YouTube Shorts Auto Scroll
// @namespace    https://github.com/PsinaDev/youtube-shorts-autoscroll
// @version      2.1.0
// @description  Automatically scrolls to the next YouTube Short when the current video ends
// @description:ru Автоматически прокручивает к следующему YouTube Short при завершении текущего видео
// @author       PsinaDev
// @match        https://www.youtube.com/shorts/*
// @match        https://youtube.com/shorts/*
// @match        http://www.youtube.com/shorts/*
// @match        http://youtube.com/shorts/*
// @match        https://m.youtube.com/shorts/*
// @match        http://m.youtube.com/shorts/*
// @match        https://mobile.youtube.com/shorts/*
// @match        http://mobile.youtube.com/shorts/*
// @match        https://*.youtube.com/shorts/*
// @match        http://*.youtube.com/shorts/*
// @match        https://youtu.be/shorts/*
// @match        http://youtu.be/shorts/*
// @match        https://www.youtu.be/shorts/*
// @match        http://www.youtu.be/shorts/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/PsinaDev/youtube-shorts-autoscroll
// @supportURL   https://github.com/PsinaDev/youtube-shorts-autoscroll/issues
// @updateURL    https://github.com/PsinaDev/youtube-shorts-autoscroll/raw/main/youtube-shorts-autoscroll.user.js
// @downloadURL  https://github.com/PsinaDev/youtube-shorts-autoscroll/raw/main/youtube-shorts-autoscroll.user.js
// ==/UserScript==

(function() {
    'use strict';

    /**
     * YouTube Shorts Auto Scroll Configuration
     */
    const CONFIG = {
        MONITORING_INTERVAL: 1000, // Check for new videos every 1 second
        END_VIDEO_THRESHOLD: 0.5, // Seconds before end to trigger scroll
        MIN_VIDEO_DURATION: 1, // Minimum video duration to process
        COOLDOWN_PERIOD: 2000, // Cooldown between scrolls
        NAVIGATION_DELAY: 1500, // Delay before reinitializing after navigation
        MAX_INIT_RETRIES: 5, // Maximum retries for initialization
        RETRY_DELAY: 1000, // Delay between retries
    };

    /**
     * Application state
     */
    class AutoScrollState {
        constructor() {
            this.isEnabled = true;
            this.currentVideo = null;
            this.currentVideoEventListeners = new Set();
            this.isProcessingScroll = false;
            this.lastScrollTime = 0;
            this.isInitialized = false;
            this.initRetries = 0;
        }

        /**
         * Reset state for new video
         */
        reset() {
            this.currentVideo = null;
            this.clearVideoEventListeners();
            this.isProcessingScroll = false;
            this.isInitialized = false;
            this.initRetries = 0;
        }

        /**
         * Clear all video event listeners
         */
        clearVideoEventListeners() {
            this.currentVideoEventListeners.forEach(({ video, event, handler }) => {
                video?.removeEventListener(event, handler);
            });
            this.currentVideoEventListeners.clear();
        }

        /**
         * Add video event listener with cleanup tracking
         */
        addVideoEventListener(video, event, handler) {
            video.addEventListener(event, handler);
            this.currentVideoEventListeners.add({ video, event, handler });
        }
    }

    const state = new AutoScrollState();

    /**
     * Utility functions
     */
    const utils = {
        /**
         * Debounce function execution
         */
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Check if we're on YouTube Shorts page
         */
        isOnShortsPage() {
            return window.location.pathname.includes('/shorts/') ||
                   window.location.href.includes('/shorts/');
        },

        /**
         * Check if shorts content is loaded
         */
        isShortsContentLoaded() {
            // Проверяем наличие основных элементов Shorts
            const shortsContainer = document.querySelector('ytd-shorts, ytd-reel-video-renderer, #shorts-container, [is-shorts]');
            const videoElements = document.querySelectorAll('video');

            return shortsContainer && videoElements.length > 0;
        },

        /**
         * Log with prefix
         */
        log(message, ...args) {
            console.log(`[YouTube Shorts Auto Scroll] ${message}`, ...args);
        },

        /**
         * Check if element is visible
         */
        isElementVisible(element) {
            return element &&
                   element.offsetParent !== null &&
                   element.clientHeight > 0 &&
                   element.clientWidth > 0;
        },

        /**
         * Wait for condition with timeout
         */
        waitForCondition(condition, timeout = 10000, interval = 500) {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();

                const check = () => {
                    if (condition()) {
                        resolve(true);
                    } else if (Date.now() - startTime > timeout) {
                        reject(new Error('Timeout waiting for condition'));
                    } else {
                        setTimeout(check, interval);
                    }
                };

                check();
            });
        }
    };

    /**
     * Video detection and management
     */
    class VideoManager {
        /**
         * Find the currently active video element
         */
        static getCurrentVideo() {
            const videos = document.querySelectorAll('video');

            for (const video of videos) {
                if (utils.isElementVisible(video) &&
                    !video.paused &&
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    return video;
                }
            }
            return null;
        }

        /**
         * Check if video is properly loaded and ready
         */
        static isVideoReady(video) {
            return video &&
                   video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
                   video.duration > 0 &&
                   !isNaN(video.duration) &&
                   video.duration >= CONFIG.MIN_VIDEO_DURATION;
        }

        /**
         * Check if video is near the end
         */
        static isVideoNearEnd(video) {
            return this.isVideoReady(video) &&
                   (video.duration - video.currentTime) <= CONFIG.END_VIDEO_THRESHOLD;
        }

        /**
         * Setup event listeners for a video
         */
        static setupVideoEventListeners(video) {
            if (!video || video === state.currentVideo) return;

            // Clear previous listeners
            state.clearVideoEventListeners();
            state.currentVideo = video;

            utils.log(`Setting up new video (duration: ${video.duration.toFixed(2)}s)`);

            // Listen for video end
            const handleVideoEnd = () => {
                if (state.isEnabled && !state.isProcessingScroll) {
                    utils.log('Video ended, scrolling to next');
                    NavigationManager.scrollToNext();
                }
            };

            // Listen for timeupdate to check for near-end
            const handleTimeUpdate = () => {
                if (this.isVideoNearEnd(video) &&
                    state.isEnabled &&
                    !state.isProcessingScroll) {
                    utils.log('Video near end, scrolling to next');
                    NavigationManager.scrollToNext();
                }
            };

            // Add event listeners with cleanup tracking
            state.addVideoEventListener(video, 'ended', handleVideoEnd);
            state.addVideoEventListener(video, 'timeupdate', utils.debounce(handleTimeUpdate, 250));

            // Handle video loading states
            const handleVideoReady = () => {
                utils.log('Video ready for playback');
            };

            state.addVideoEventListener(video, 'canplay', handleVideoReady);
        }
    }

    /**
     * Navigation management
     */
    class NavigationManager {
        /**
         * Scroll to the next short
         */
        static scrollToNext() {
            // Check cooldown period
            const now = Date.now();
            if (now - state.lastScrollTime < CONFIG.COOLDOWN_PERIOD) {
                return;
            }

            state.isProcessingScroll = true;
            state.lastScrollTime = now;

            try {
                // Primary method: Arrow down key simulation
                const keyEvent = new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    code: 'ArrowDown',
                    keyCode: 40,
                    which: 40,
                    bubbles: true,
                    cancelable: true
                });

                document.dispatchEvent(keyEvent);
                utils.log('Scrolled to next short');

                // Wait for new video to load
                setTimeout(() => {
                    state.isProcessingScroll = false;
                }, CONFIG.COOLDOWN_PERIOD);

            } catch (error) {
                utils.log('Error scrolling to next short:', error);
                state.isProcessingScroll = false;
            }
        }
    }

    /**
     * Enhanced navigation detection
     */
    class NavigationDetector {
        constructor() {
            this.lastUrl = location.href;
            this.lastPathname = location.pathname;
            this.observers = [];
            this.setupDetection();
        }

        setupDetection() {
            // Method 1: History API events
            this.setupHistoryEvents();

            // Method 2: MutationObserver for DOM changes
            this.setupMutationObserver();

            // Method 3: Interval check for URL changes
            this.setupIntervalCheck();

            // Method 4: YouTube-specific events
            this.setupYouTubeEvents();
        }

        setupHistoryEvents() {
            // Override pushState and replaceState
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function(...args) {
                originalPushState.apply(this, args);
                setTimeout(() => this.handleNavigation(), 100);
            }.bind(this);

            history.replaceState = function(...args) {
                originalReplaceState.apply(this, args);
                setTimeout(() => this.handleNavigation(), 100);
            }.bind(this);

            // Listen for popstate
            window.addEventListener('popstate', () => {
                setTimeout(() => this.handleNavigation(), 100);
            });
        }

        setupMutationObserver() {
            // Observe changes in the main content area
            const observer = new MutationObserver(utils.debounce(() => {
                this.handleNavigation();
            }, 300));

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'id']
            });

            this.observers.push(observer);
        }

        setupIntervalCheck() {
            // Fallback: check URL changes every second
            setInterval(() => {
                if (location.href !== this.lastUrl || location.pathname !== this.lastPathname) {
                    this.handleNavigation();
                }
            }, 1000);
        }

        setupYouTubeEvents() {
            // Listen for YouTube-specific events
            document.addEventListener('yt-navigate-start', () => {
                utils.log('YouTube navigation started');
            });

            document.addEventListener('yt-navigate-finish', () => {
                utils.log('YouTube navigation finished');
                setTimeout(() => this.handleNavigation(), 500);
            });

            // Listen for app state changes
            window.addEventListener('yt-page-data-updated', () => {
                setTimeout(() => this.handleNavigation(), 300);
            });
        }

        handleNavigation() {
            const currentUrl = location.href;
            const currentPathname = location.pathname;

            if (currentUrl !== this.lastUrl || currentPathname !== this.lastPathname) {
                utils.log(`Navigation detected: ${this.lastPathname} → ${currentPathname}`);

                this.lastUrl = currentUrl;
                this.lastPathname = currentPathname;

                if (utils.isOnShortsPage()) {
                    utils.log('Navigated to Shorts page, reinitializing...');
                    AutoScrollApp.initializeWithRetry();
                } else {
                    utils.log('Left Shorts page, cleaning up...');
                    state.reset();
                }
            }
        }

        destroy() {
            this.observers.forEach(observer => observer.disconnect());
            this.observers = [];
        }
    }

    /**
     * Main application controller
     */
    class AutoScrollApp {
        static navigationDetector = null;

        /**
         * Initialize the application
         */
        static async init() {
            if (!utils.isOnShortsPage()) {
                return false;
            }

            utils.log('Initializing YouTube Shorts Auto Scroll');

            try {
                // Wait for Shorts content to load
                await utils.waitForCondition(() => utils.isShortsContentLoaded(), 10000);

                // Reset state
                state.reset();
                state.isInitialized = true;

                // Start monitoring
                this.startMonitoring();

                // Setup keyboard shortcuts
                this.setupKeyboardShortcuts();

                utils.log('YouTube Shorts Auto Scroll initialized successfully');
                return true;

            } catch (error) {
                utils.log('Failed to initialize:', error);
                return false;
            }
        }

        /**
         * Initialize with retry mechanism
         */
        static async initializeWithRetry() {
            if (!utils.isOnShortsPage()) {
                return;
            }

            // Cancel previous initialization attempts
            state.reset();

            let success = false;
            state.initRetries = 0;

            while (!success && state.initRetries < CONFIG.MAX_INIT_RETRIES) {
                state.initRetries++;
                utils.log(`Initialization attempt ${state.initRetries}/${CONFIG.MAX_INIT_RETRIES}`);

                success = await this.init();

                if (!success) {
                    utils.log(`Initialization failed, retrying in ${CONFIG.RETRY_DELAY}ms...`);
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
                }
            }

            if (!success) {
                utils.log('Failed to initialize after maximum retries');
            }
        }

        /**
         * Start video monitoring
         */
        static startMonitoring() {
            const monitorVideos = () => {
                if (!utils.isOnShortsPage() || state.isProcessingScroll || !state.isInitialized) {
                    return;
                }

                const currentVideo = VideoManager.getCurrentVideo();

                if (currentVideo && currentVideo !== state.currentVideo) {
                    VideoManager.setupVideoEventListeners(currentVideo);
                }
            };

            // Monitor for video changes
            setInterval(monitorVideos, CONFIG.MONITORING_INTERVAL);
        }

        /**
         * Setup keyboard shortcuts
         */
        static setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Ctrl + Shift + A to toggle auto scroll
                if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                    e.preventDefault();
                    state.isEnabled = !state.isEnabled;
                    utils.log(`Auto scroll ${state.isEnabled ? 'enabled' : 'disabled'} (keyboard shortcut)`);
                }
            });
        }

        /**
         * Setup enhanced navigation detection
         */
        static setupNavigationDetection() {
            if (this.navigationDetector) {
                this.navigationDetector.destroy();
            }
            this.navigationDetector = new NavigationDetector();
        }
    }

    /**
     * Application entry point
     */
    function bootstrap() {
        utils.log('YouTube Shorts Auto Scroll starting...');

        // Setup enhanced navigation detection
        AutoScrollApp.setupNavigationDetection();

        // Initialize if already on shorts page
        if (utils.isOnShortsPage()) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => AutoScrollApp.initializeWithRetry(), CONFIG.NAVIGATION_DELAY);
                });
            } else {
                setTimeout(() => AutoScrollApp.initializeWithRetry(), CONFIG.NAVIGATION_DELAY);
            }
        }

        // Make functions available globally for debugging
        window.YouTubeShortsAutoScroll = {
            toggle: () => {
                state.isEnabled = !state.isEnabled;
                utils.log(`Auto scroll ${state.isEnabled ? 'enabled' : 'disabled'} (manual)`);
                return state.isEnabled;
            },
            status: () => {
                const status = {
                    enabled: state.isEnabled,
                    initialized: state.isInitialized,
                    currentVideo: !!state.currentVideo,
                    onShortsPage: utils.isOnShortsPage(),
                    shortsContentLoaded: utils.isShortsContentLoaded(),
                    readyState: document.readyState,
                    retries: state.initRetries
                };
                utils.log('Status:', status);
                return status;
            },
            forceStart: () => {
                AutoScrollApp.initializeWithRetry();
                utils.log('Force started application');
            },
            reset: () => {
                state.reset();
                utils.log('State reset');
            }
        };

        utils.log('YouTube Shorts Auto Scroll loaded successfully');
        utils.log('Toggle with Ctrl+Shift+A or YouTubeShortsAutoScroll.toggle()');
    }

    // Start the application
    bootstrap();

})();