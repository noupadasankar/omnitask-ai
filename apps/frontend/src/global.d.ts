import 'framer-motion';

declare module 'framer-motion' {
  export interface HTMLMotionProps {
    className?: string;
  }
  export interface SVGMotionProps {
    className?: string;
  }
}
