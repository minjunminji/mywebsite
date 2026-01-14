"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ResumePopup.module.css";

const resumes = [
  { label: "Software Engineering", filename: "ryan_kim_swe.pdf" },
  { label: "Product Management", filename: "ryan_kim_pm.pdf" },
  { label: "AI", filename: "ryan_kim_ai.pdf" },
];

const DownloadIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ResumePopup = ({ onClose, x, y }) => {
  const popupRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const clampToViewport = () => {
      const el = popupRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const padding = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = x;
      let top = y;

      if (left + rect.width > vw - padding) left = vw - rect.width - padding;
      if (left < padding) left = padding;
      if (top + rect.height > vh - padding) top = vh - rect.height - padding;
      if (top < padding) top = padding;

      setPosition({ left, top });
    };

    clampToViewport();

    window.addEventListener("resize", clampToViewport);
    return () => {
      window.removeEventListener("resize", clampToViewport);
    };
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleDownload = (filename) => {
    window.open(`/assets/${filename}`, "_blank");
  };

  return createPortal(
    <div
      ref={popupRef}
      className={styles.popup}
      style={{ left: position.left, top: position.top }}
    >
      <div className={styles.header}>
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>
      </div>
      <div className={styles.resumeList}>
        {resumes.map((resume) => (
          <div key={resume.filename} className={styles.resumeRow}>
            <span className={styles.resumeLabel}>{resume.label}</span>
            <button
              className={styles.downloadButton}
              onClick={() => handleDownload(resume.filename)}
              aria-label={`Download ${resume.label} resume`}
            >
              <DownloadIcon className={styles.downloadIcon} />
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default ResumePopup;
