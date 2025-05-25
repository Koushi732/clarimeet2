/// <reference types="react-scripts" />

import * as React from 'react';

// Define a catch-all for JSX intrinsic elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Allow any element name with any attribute
      [elemName: string]: any;
    }
  }
}

// Fix React module type issues
declare module 'react' {
  // Fix Element vs ReactNode compatibility
  export interface ReactElement {
    type: any;
    props: any;
    key: any;
  }
  
  // Ensure Element is compatible with ReactNode
  export interface Element extends ReactElement {}
  
  // Define ReactNode types
  export type ReactNode = ReactElement | string | number | ReactFragment | ReactPortal | boolean | null | undefined;
  export type ReactFragment = {} | ReactNodeArray;
  export interface ReactNodeArray extends Array<ReactNode> {}
  export type ReactPortal = ReactElement;
  
  // Fix for JSX Element class issue
  export interface ComponentClass<P = {}> {
    new(props: P, context?: any): Component<P, any>;
    propTypes?: any;
    contextTypes?: any;
    defaultProps?: Partial<P>;
    displayName?: string;
  }
  
  export interface Component<P = {}, S = {}> {
    props: P;
    state: S;
    context: any;
    refs: {
      [key: string]: any;
    };
    setState(state: S | ((prevState: S, props: P) => S), callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
    render(): ReactNode;
  }
  
  export const StrictMode: React.FC<{children: React.ReactNode}>;
  
  // Fix function component types
  export type FC<P = {}> = FunctionComponent<P>;
  export interface FunctionComponent<P = {}> {
    (props: P, context?: any): ReactElement<any, any> | null;
    propTypes?: any;
    contextTypes?: any;
    defaultProps?: Partial<P>;
    displayName?: string;
  }
  
  // Fix event types
  export interface DragEvent<T = any> {
    dataTransfer: DataTransfer;
    preventDefault(): void;
    stopPropagation(): void;
    target: any;
    currentTarget: any;
    type: string;
  }
  
  export interface ChangeEvent<T = any> {
    target: T & {
      files?: FileList;
      value?: any;
    };
    currentTarget: any;
    preventDefault(): void;
    stopPropagation(): void;
    type: string;
  }
  
  // Export React hooks for module augmentation
  export const useState: typeof React.useState;
  export const useEffect: typeof React.useEffect;
  export const useRef: typeof React.useRef;
  export const useCallback: typeof React.useCallback;
  export const useMemo: typeof React.useMemo;
  export const useContext: typeof React.useContext;
  export const useReducer: typeof React.useReducer;
  export const useImperativeHandle: typeof React.useImperativeHandle;
  export const useLayoutEffect: typeof React.useLayoutEffect;
  export const useDebugValue: typeof React.useDebugValue;
  export const createContext: typeof React.createContext;
  
  export type ChangeEvent<T extends HTMLElement = HTMLElement> = React.ChangeEvent<T>;
  export type FormEvent<T extends HTMLElement = HTMLElement> = React.FormEvent<T>;
  export type MouseEvent<T extends HTMLElement = HTMLElement> = React.MouseEvent<T>;
  export type KeyboardEvent<T extends HTMLElement = HTMLElement> = React.KeyboardEvent<T>;
}
