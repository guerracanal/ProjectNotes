'use client';

import { useEffect } from 'react';

export default function ImageLightbox({ images, currentIndex, onClose, onNavigate }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowLeft') {
                handlePrevious();
            } else if (e.key === 'ArrowRight') {
                handleNext();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        // Prevenir scroll del body cuando el lightbox está abierto
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [currentIndex]);

    const handlePrevious = () => {
        if (currentIndex > 0) {
            onNavigate(currentIndex - 1);
        } else {
            // Loop to last image
            onNavigate(images.length - 1);
        }
    };

    const handleNext = () => {
        if (currentIndex < images.length - 1) {
            onNavigate(currentIndex + 1);
        } else {
            // Loop to first image
            onNavigate(0);
        }
    };

    const currentImage = images[currentIndex];

    return (
        <div className="lightbox-overlay" onClick={onClose}>
            <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                {/* Close button */}
                <button className="lightbox-close" onClick={onClose} aria-label="Close">
                    ✕
                </button>

                {/* Navigation buttons */}
                {images.length > 1 && (
                    <>
                        <button
                            className="lightbox-nav lightbox-nav-prev"
                            onClick={handlePrevious}
                            aria-label="Previous image"
                        >
                            ‹
                        </button>
                        <button
                            className="lightbox-nav lightbox-nav-next"
                            onClick={handleNext}
                            aria-label="Next image"
                        >
                            ›
                        </button>
                    </>
                )}

                {/* Image */}
                <div className="lightbox-image-container">
                    <img
                        src={`/api/projects/${currentImage.path}?type=file`}
                        alt={currentImage.name}
                        className="lightbox-image"
                    />
                </div>

                {/* Info bar */}
                <div className="lightbox-info">
                    <span className="lightbox-name">{currentImage.name}</span>
                    <span className="lightbox-counter">
                        {currentIndex + 1} / {images.length}
                    </span>
                </div>
            </div>

            <style jsx>{`
                .lightbox-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.95);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .lightbox-content {
                    position: relative;
                    width: 90vw;
                    height: 90vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                }

                .lightbox-close {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: rgba(0, 0, 0, 0.7);
                    border: none;
                    color: white;
                    font-size: 2rem;
                    width: 3rem;
                    height: 3rem;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    z-index: 10;
                    line-height: 1;
                }

                .lightbox-close:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: scale(1.1);
                }

                .lightbox-nav {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    border: none;
                    color: white;
                    font-size: 3rem;
                    width: 4rem;
                    height: 4rem;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    z-index: 10;
                    line-height: 1;
                }

                .lightbox-nav:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateY(-50%) scale(1.1);
                }

                .lightbox-nav-prev {
                    left: 2rem;
                }

                .lightbox-nav-next {
                    right: 2rem;
                }

                .lightbox-image-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    padding: 4rem 2rem 1rem 2rem;
                }

                .lightbox-image {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    animation: zoomIn 0.3s ease;
                    border-radius: 8px;
                }

                @keyframes zoomIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                .lightbox-info {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    padding: 1rem 2rem;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(10px);
                    border-radius: 8px;
                    margin-top: 1rem;
                }

                .lightbox-name {
                    color: white;
                    font-size: 1rem;
                    font-weight: 500;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    flex: 1;
                    margin-right: 1rem;
                }

                .lightbox-counter {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.9rem;
                    white-space: nowrap;
                }

                @media (max-width: 768px) {
                    .lightbox-nav {
                        width: 3rem;
                        height: 3rem;
                        font-size: 2rem;
                    }

                    .lightbox-nav-prev {
                        left: 1rem;
                    }

                    .lightbox-nav-next {
                        right: 1rem;
                    }

                    .lightbox-close {
                        width: 2.5rem;
                        height: 2.5rem;
                        font-size: 1.5rem;
                    }
                }
            `}</style>
        </div>
    );
}
