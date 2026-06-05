import 'framer-motion';

declare module 'framer-motion' {
  export interface HTMLMotionProps<T> {
    className?: string;
  }
  export interface SVGMotionProps<T> {
    className?: string;
  }
}
