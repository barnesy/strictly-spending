import { useAnimationStore } from '../animationStore';

export default function DynamicAnimationStyles() {
  const config = useAnimationStore();

  const css = `
    @keyframes exitFlipRight {
      0% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
      ${config.midStepPct - 1}% {
        z-index: 10;
      }
      ${config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
        z-index: 0;
      }
      100% {
        transform: perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 0;
      }
    }

    @keyframes exitFlipLeft {
      0% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
      ${config.midStepPct - 1}% {
        z-index: 10;
      }
      ${config.midStepPct}% {
        transform: perspective(1200px) translate3d(${-config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(-${config.midRotationY}deg) rotateZ(-${config.midRotationZ}deg) scale(${config.midScale});
        z-index: 0;
      }
      100% {
        transform: perspective(1200px) translate3d(${-config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(-${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 0;
      }
    }

    @keyframes entryFlipRight {
      0% {
        transform: perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 0;
      }
      ${100 - config.midStepPct - 1}% {
        z-index: 0;
      }
      ${100 - config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
        z-index: 10;
      }
      100% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
    }

    @keyframes entryFlipLeft {
      0% {
        transform: perspective(1200px) translate3d(${-config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(-${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 0;
      }
      ${100 - config.midStepPct - 1}% {
        z-index: 0;
      }
      ${100 - config.midStepPct}% {
        transform: perspective(1200px) translate3d(${-config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(-${config.midRotationY}deg) rotateZ(-${config.midRotationZ}deg) scale(${config.midScale});
        z-index: 10;
      }
      100% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
    }
  `;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
