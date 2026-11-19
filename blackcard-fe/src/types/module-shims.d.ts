declare module "@radix-ui/react-checkbox";
declare module "@radix-ui/react-dialog";
declare module "@radix-ui/react-dropdown-menu";
declare module "@radix-ui/react-label";
declare module "@radix-ui/react-select";
declare module "@radix-ui/react-separator";
declare module "@radix-ui/react-slider";
declare module "@radix-ui/react-slot";
declare module "@radix-ui/react-tabs";
declare module "@radix-ui/react-tooltip";
declare module "class-variance-authority" {
  export const cva: (...args: any[]) => any;
  export type VariantProps<T> = T extends (...args: any[]) => any
    ? Record<string, any>
    : Record<string, any>;
}
