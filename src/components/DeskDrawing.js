"use client";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Popup from "./Popup";
import styles from "./DeskDrawing.module.css";

const DeskDrawing = () => {
  const [svgContent, setSvgContent] = useState(null);
  const [popup, setPopup] = useState(null);
  const svgContainerRef = useRef(null);

  useEffect(() => {
    fetch("/assets/deskdrawing.svg")
      .then((res) => res.text())
      .then((text) => setSvgContent(text));
  }, []);

  const popupsData = useMemo(
    () => ({
      Interface: {
        content: (
          <>
            I love making music in my spare time! This is my audio interface
            that I use when I record. Check out my music{" "}
            <a
              href="https://www.instagram.com/mnjnmsc"
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram page
            </a>
            !
          </>
        ),
      },
      "DE1-SoC": {
        content:
          "I&apos;m in computer engineering and we&apos;re learning about low level systems and stuff so I use the DE1-SoC quite often and it&apos;s been a lot of fun learning about the very foundational building blocks of computers.",
      },
      PC: {
        content:
          "I built my PC five years ago - it has a RTX 2080Ti and i7-8700K. I use it for school, content, music, and video games.",
      },
      Kbd: {
        content: (
          <>
            This is my keyboard (surprise){" "}
            <a
              href="https://monkeytype.com/profile/frostic1393"
              target="_blank"
              rel="noopener noreferrer"
            >
              monkeytype
            </a>
          </>
        ),
      },
      Mouse: {
        content: (
          <>
            This is my Logitech G Pro Superlight, imo the perfect mouse. I used
            it to hit my peak rank in Valorant, Ascendant 2.{" "}
            <a
              href="https://tracker.gg/valorant/profile/riot/chuchubluu%23pika/overview?platform=pc&playlist=competitive"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stats
            </a>
          </>
        ),
      },
      Mango: {
        content: (
          <>
            <p>
              In 24 hours at HelloHacks 2025, my team and I built Mango, a
              full-body gesture control system that lets you play Minecraft
              using just your webcam. No sensors, no VR headset, just movement.
              We wanted to make immersive gaming more accessible and open to
              everyone.
            </p>
            <p>
              Mango uses MediaPipe Holistic and OpenCV to track over 500 body
              landmarks, while NumPy and PyAutoGUI translate those movements
              into real-time keyboard and mouse inputs. Walking, hitting,
              mining, placing, shielding — you can control it with your body.
            </p>
            <iframe
              width="100%"
              height="315"
              src="https://www.youtube.com/embed/pdja2_o8bpY"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
            <p>
              <a
                href="https://devpost.com/software/mango-full-body-gesture-control-for-any-game"
                target="_blank"
                rel="noopener noreferrer"
              >
                Devpost
              </a>
            </p>
          </>
        ),
      },
      Ubc: {
        content: (
          <>
            <p>
              At UBC, scheduling classes through Workday was tedious — copying
              times by hand, fixing time zones, and juggling course changes
              every week. So I built a web app that does it all automatically.
            </p>
            <p>
              The UBC Workday → Calendar tool takes your course schedule and
              converts it into a downloadable iCalendar file you can import
              straight into Google or Apple Calendar. Built with Python, React,
              and TypeScript, it parses Workday’s messy HTML behind the scenes
              and delivers clean, perfectly timed events in seconds.
            </p>
            <p>
              What started as a weekend project to save myself time ended up
              helping over a hundred students manage their schedules seamlessly
              — all through a single link shared across campus.
            </p>
            <p>
              <a
                href="https://ubcworkdaycalendartool.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit the tool
              </a>
            </p>
          </>
        ),
      },
      "This-website": {
        content:
          "This website is a personal project to showcase my skills and projects in a more creative and interactive way. It&apos;s built with Next.js and uses a zoomable SVG for navigation.",
      },
      UBCCARD: {
        content: (
          <>
            <p>
              I&apos;m a 2nd year computer engineering student at the University
              of British Columbia.
            </p>
            <p>
              <strong>Relevant Coursework:</strong> Data Structures and
              Algorithms, Object-Oriented Programming, Linear Algebra,
              Probability & Statistics, FPGA Design, Digital Systems
            </p>
          </>
        ),
      },
      Midi: {
        content: (
          <>
            <p>
              I use this AKAI APC Key25 to record instrumentals for my music!
              I&apos;ve studied classical piano since I was five years old, and
              my favourite composer is Chopin. Here&apos;s me performing his
              first piano concerto with the VSO Symphony Orchestra at the
              Orpheum Theatre:
            </p>
            <iframe
              width="100%"
              height="315"
              src="https://www.youtube.com/embed/ueOshaElP9E"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </>
        ),
      },
    }),
    []
  );

  const handleSvgClick = useCallback(
    (e) => {
      const target = e.target.closest("g[id]");
      if (!target) return;

      const id = target.id;

      if (popupsData[id]) {
        setPopup({
          content: popupsData[id].content,
          x: e.clientX,
          y: e.clientY,
        });
      } else if (id === "Resume") {
        window.open("/assets/websiteresume.pdf", "_blank");
      } else if (id === "Github") {
        window.open("https://github.com/minjunminji", "_blank");
      } else if (id === "Linkedin") {
        window.open("https://www.linkedin.com/in/ryankim373/", "_blank");
      }
    },
    [popupsData]
  );

  const handleClosePopup = () => {
    setPopup(null);
  };

  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer || !svgContent) return;

    const interactiveIds = [
      ...Object.keys(popupsData),
      "Resume",
      "Github",
      "Linkedin",
    ];

    interactiveIds.forEach((id) => {
      const group = svgContainer.querySelector(`#${id}`);
      if (group) {
        const bbox = group.getBBox();
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        rect.setAttribute("x", bbox.x);
        rect.setAttribute("y", bbox.y);
        rect.setAttribute("width", bbox.width);
        rect.setAttribute("height", bbox.height);
        rect.setAttribute("fill", "transparent");
        group.insertBefore(rect, group.firstChild);
      }
    });

    const handleMouseOver = (e) => {
      const target = e.target.closest("g[id]");
      if (
        target &&
        (popupsData[target.id] ||
          ["Resume", "Github", "Linkedin"].includes(target.id))
      ) {
        target.style.cursor = "pointer";
        target.style.transition =
          "transform 0.2s ease-in-out, filter 0.2s ease-in-out";
        target.style.transform = "translateY(-2px)";
        target.style.filter = "drop-shadow(1px 1px 1px rgb(0 0 0 / 0.4))";

        const paths = target.querySelectorAll("path");
        paths.forEach((path) => {
          const originalStroke = path.getAttribute("stroke");
          if (originalStroke) {
            path.setAttribute("data-original-stroke", originalStroke);
          }
          path.setAttribute("stroke", "#4287f5");
        });
      }
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest("g[id]");
      if (target) {
        target.style.transform = "";
        target.style.filter = "";

        const paths = target.querySelectorAll("path");
        paths.forEach((path) => {
          const originalStroke = path.getAttribute("data-original-stroke");
          if (originalStroke) {
            path.setAttribute("stroke", originalStroke);
            path.removeAttribute("data-original-stroke");
          }
        });
      }
    };

    svgContainer.addEventListener("mouseover", handleMouseOver);
    svgContainer.addEventListener("mouseout", handleMouseOut);
    svgContainer.addEventListener("click", handleSvgClick);

    return () => {
      svgContainer.removeEventListener("mouseover", handleMouseOver);
      svgContainer.removeEventListener("mouseout", handleMouseOut);
      svgContainer.removeEventListener("click", handleSvgClick);
    };
  }, [svgContent, handleSvgClick, popupsData]);

  return (
    <div className={styles.container}>
      <TransformWrapper
        initialScale={5.7}
        initialPositionX={0}
        initialPositionY={500}
      >
        <TransformComponent>
          <div
            ref={svgContainerRef}
            className={styles.svgContainer}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </TransformComponent>
      </TransformWrapper>
      {popup && (
        <Popup
          content={popup.content}
          onClose={handleClosePopup}
          x={popup.x}
          y={popup.y}
        />
      )}
    </div>
  );
};

export default DeskDrawing;
