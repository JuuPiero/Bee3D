declare module "cc" {
    export namespace _decorator {
        export const serializable: (
            target: Record<string, any>, propertyKey: string | symbol, descriptorOrInitializer?: BabelPropertyDecoratorDescriptor | Initializer | null,
        ) => void;
    }
}
