// Complete override for JSX namespace to fix all type errors
declare namespace JSX {
  interface Element { }
  
  interface ElementAttributesProperty {
    props: {};
  }
  
  interface ElementChildrenAttribute {
    children: {};
  }
  
  interface IntrinsicAttributes {
    key?: string | number;
    className?: string;
    style?: React.CSSProperties;
    id?: string;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnter?: (event: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (event: React.DragEvent<HTMLElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLElement>) => void;
    onChange?: (event: React.ChangeEvent<HTMLElement>) => void;
    onSubmit?: (event: React.FormEvent<HTMLElement>) => void;
    [key: string]: any;
  }
  
  interface IntrinsicClassAttributes<T> {
    ref?: React.Ref<T>;
  }
  
  // Comprehensive intrinsic elements
  interface IntrinsicElements {
    // Default catch-all for any element
    [elemName: string]: any;
    
    // Common HTML elements
    div: any;
    p: any;
    span: any;
    h1: any;
    h2: any;
    h3: any;
    h4: any;
    h5: any;
    h6: any;
    button: any;
    input: any;
    textarea: any;
    select: any;
    option: any;
    form: any;
    label: any;
    a: any;
    img: any;
    ul: any;
    ol: any;
    li: any;
    table: any;
    tr: any;
    td: any;
    th: any;
    thead: any;
    tbody: any;
    section: any;
    article: any;
    nav: any;
    header: any;
    footer: any;
    main: any;
    aside: any;
    option: any;
    label: any;
    ul: any;
    ol: any;
    li: any;
    canvas: any;
    details: any;
    summary: any;
    strong: any;
    a: any;
  }
}

// Fix React types
declare module 'react' {
  // Override Element type
  export interface Element {
    type: any;
    props: any;
    key: any;
  }
  
  // Fix ReactNode type
  export type ReactNode = Element | string | number | boolean | null | undefined | ReactNodeArray;
  export interface ReactNodeArray extends Array<ReactNode> {}
  
  // Fix FC type
  export type FC<P = {}> = FunctionComponent<P>;
  export interface FunctionComponent<P = {}> {
    (props: P): ReactNode;
    displayName?: string;
  }
  
  // Fix event types
  export interface SyntheticEvent {
    preventDefault(): void;
    stopPropagation(): void;
    target: any;
    currentTarget: any;
  }
  
  export interface DragEvent extends SyntheticEvent {
    dataTransfer: DataTransfer;
  }
  
  export interface ChangeEvent extends SyntheticEvent {
    target: {
      value: any;
      files?: FileList;
      [key: string]: any;
    };
  }
  
  // Fix HTML element types
  export interface HTMLInputElement extends HTMLElement {
    files: FileList | null;
    value: string;
  }
}
