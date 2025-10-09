"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./Popup.module.css";

const Popup = ({ content, onClose, x, y }) => {
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
    window.addEventListener("scroll", clampToViewport, true);
    return () => {
      window.removeEventListener("resize", clampToViewport);
      window.removeEventListener("scroll", clampToViewport, true);
    };
  }, [x, y]);

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div
        ref={popupRef}
        className={styles.popup}
        style={{ left: position.left, top: position.top }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <div className={styles.popupContent}>{content}</div>
      </div>
    </div>
  );
};

export default Popup;
