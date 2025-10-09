"use client";
import styles from "./Popup.module.css";

const Popup = ({ content, onClose, x, y }) => {
  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div
        className={styles.popup}
        style={{ left: x, top: y }}
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
