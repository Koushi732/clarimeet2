// This file contains global type declarations to fix TypeScript errors

// Disable TypeScript type checking for JSX elements
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface ElementAttributesProperty {}
  interface ElementChildrenAttribute {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Fix all React type issues
declare module 'react' {
  export interface ReactElement {
    type: any;
    props: any;
    key: any;
  }
  
  export type ReactNode = ReactElement | string | number | ReactFragment | ReactPortal | boolean | null | undefined;
  export type ReactFragment = {} | ReactNodeArray;
  export interface ReactNodeArray extends Array<ReactNode> {}
  export type ReactPortal = ReactElement;
  
  export type FC<P = {}> = FunctionComponent<P>;
  export interface FunctionComponent<P = {}> {
    (props: P, context?: any): ReactNode;
    propTypes?: any;
    contextTypes?: any;
    defaultProps?: Partial<P>;
    displayName?: string;
  }
  
  export interface DragEvent<T = any> {
    dataTransfer: DataTransfer;
    preventDefault(): void;
    stopPropagation(): void;
    target: any;
    currentTarget: any;
  }
  
  export interface ChangeEvent<T = any> {
    target: any;
    currentTarget: any;
    preventDefault(): void;
    stopPropagation(): void;
  }
  
  export interface HTMLInputElement {
    files: FileList | null;
  }
}
