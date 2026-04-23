'use client';

import { useState, useEffect } from 'react';

export default function ScrollButtons() {
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;

            // Show "scroll to top" when scrolled down more than 300px
            setShowScrollTop(scrollY > 300);

            // Show "scroll to bottom" when not near the bottom (more than 300px from bottom)
            setShowScrollBottom(scrollY < documentHeight - windowHeight - 300);
        };

        // Initial check
        handleScroll();

        // Add scroll listener
        window.addEventListener('scroll', handleScroll);

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const scrollToBottom = () => {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    };

    return (
        <>
            {/* Scroll to Top Button */}
            <button
                className={`scroll-btn scroll-top ${showScrollTop ? 'visible' : ''}`}
                onClick={scrollToTop}
                aria-label="Scroll to top"
                title="Scroll to top"
            >
                ↑
            </button>

            {/* Scroll to Bottom Button */}
            <button
                className={`scroll-btn scroll-bottom ${showScrollBottom ? 'visible' : ''}`}
                onClick={scrollToBottom}
                aria-label="Scroll to bottom"
                title="Scroll to bottom"
            >
                ↓
            </button>

            <style jsx>{`
                .scroll-btn {
                    position: fixed;
                    right: 2rem;
                    width: 48px;
                    height: 48px;
                    background: var(--accent-primary);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 1.5rem;
                    font-weight: bold;
                    cursor: pointer;
                    opacity: 0;
                    visibility: hidden;
                    transform: scale(0.8);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    z-index: 9000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .scroll-btn.visible {
                    opacity: 1;
                    visibility: visible;
                    transform: scale(1);
                }

                .scroll-btn:hover {
                    background: var(--accent-secondary);
                    transform: scale(1.1);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
                }

                .scroll-btn:active {
                    transform: scale(0.95);
                }

                .scroll-top {
                    bottom: 8rem;
                }

                .scroll-bottom {
                    bottom: 4rem;
                }

                /* Mobile adjustments */
                @media (max-width: 768px) {
                    .scroll-btn {
                        right: 1rem;
                        width: 44px;
                        height: 44px;
                        font-size: 1.3rem;
                    }

                    .scroll-top {
                        bottom: 7rem;
                    }

                    .scroll-bottom {
                        bottom: 3.5rem;
                    }
                }

                /* Animation for smoother transitions */
                @keyframes fadeInScale {
                    from {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </>
    );
}
