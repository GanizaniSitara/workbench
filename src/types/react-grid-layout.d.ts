declare module "react-grid-layout" {
  import type {
    Component,
    ComponentType,
    CSSProperties,
    ReactElement,
    ReactNode,
  } from "react";

  export type ResizeHandle = "s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne";

  export interface Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    moved?: boolean;
    static?: boolean;
    isDraggable?: boolean | null;
    isResizable?: boolean | null;
    resizeHandles?: ResizeHandle[];
    isBounded?: boolean;
  }

  export interface Layouts {
    [breakpoint: string]: Layout[];
  }

  export interface GridLayoutProps {
    className?: string;
    style?: CSSProperties;
    width?: number;
    autoSize?: boolean;
    cols?: number;
    draggableCancel?: string;
    draggableHandle?: string;
    compactType?: "vertical" | "horizontal" | null;
    layout?: Layout[];
    margin?: [number, number] | { [breakpoint: string]: [number, number] };
    containerPadding?: [number, number] | null;
    rowHeight?: number;
    maxRows?: number;
    isDraggable?: boolean;
    isResizable?: boolean;
    isBounded?: boolean;
    isDroppable?: boolean;
    preventCollision?: boolean;
    useCSSTransforms?: boolean;
    transformScale?: number;
    resizeHandles?: ResizeHandle[];
    onLayoutChange?: (layout: Layout[]) => void;
    onDragStart?: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
    onDrag?: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
    onDragStop?: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
    onResizeStart?: (
      layout: Layout[],
      oldItem: Layout,
      newItem: Layout,
    ) => void;
    onResize?: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
    onResizeStop?: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
    children?: ReactNode;
  }

  export interface ResponsiveGridLayoutProps extends Omit<
    GridLayoutProps,
    "layout" | "cols" | "onLayoutChange"
  > {
    breakpoints?: { [breakpoint: string]: number };
    cols?: { [breakpoint: string]: number };
    layouts?: Layouts;
    onLayoutChange?: (currentLayout: Layout[], allLayouts: Layouts) => void;
    onBreakpointChange?: (newBreakpoint: string, newCols: number) => void;
    onWidthChange?: (
      containerWidth: number,
      margin: [number, number],
      cols: number,
      containerPadding: [number, number] | null,
    ) => void;
  }

  export interface WidthProviderProps {
    measureBeforeMount?: boolean;
  }

  function GridLayout(props: GridLayoutProps): ReactElement | null;
  export default GridLayout;

  export class Responsive extends Component<ResponsiveGridLayoutProps> {}

  export function WidthProvider<P extends { width?: number }>(
    WrappedComponent: ComponentType<P>,
  ): ComponentType<Omit<P, "width"> & WidthProviderProps>;
}
