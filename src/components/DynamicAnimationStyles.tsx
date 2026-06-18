import { useAnimationStore } from '../animationStore';

export default function DynamicAnimationStyles() {
  const config = useAnimationStore();

  const css = `
    @keyframes exitFlipRight {
      0% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
      ${config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
      }
      ${config.zSplitPct - 1}% {
        z-index: 10;
      }
      ${config.zSplitPct}% {
        z-index: 7;
      }
      100% {
        transform: perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 7;
      }
    }

    @keyframes exitFlipLeft {
      0% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
      ${config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXLeft}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(-${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
      }
      ${config.zSplitPct - 1}% {
        z-index: 10;
      }
      ${config.zSplitPct}% {
        z-index: 7;
      }
      100% {
        transform: perspective(1200px) translate3d(${config.finalXLeft}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 7;
      }
    }

    @keyframes entryFlipRight {
      0% {
        transform: perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 7;
      }
      ${config.zSplitPct - 1}% {
        z-index: 7;
      }
      ${config.zSplitPct}% {
        z-index: 10;
      }
      ${100 - config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
      }
      100% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
    }

    @keyframes entryFlipLeft {
      0% {
        transform: perspective(1200px) translate3d(${config.finalXLeft}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale});
        z-index: 7;
      }
      ${config.zSplitPct - 1}% {
        z-index: 7;
      }
      ${config.zSplitPct}% {
        z-index: 10;
      }
      ${100 - config.midStepPct}% {
        transform: perspective(1200px) translate3d(${config.exitXLeft}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(-${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale});
      }
      100% {
        transform: perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale});
        z-index: 10;
      }
    }
  `;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
