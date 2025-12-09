export class Stack<T>
{
    private stack: T[] = [];

    public constructor()
    {
        this.stack = [];
    }

    public push(element: T): void
    {
        this.stack.push(element);
    }

    public pop(): T
    {
        return this.stack.pop();
    }

    public peek(): T
    {
        return this.stack[ this.stack.length - 1 ];
    }

    public isEmpty(): boolean
    {
        return this.stack.length === 0;
    }

    public size(): number
    {
        return this.stack.length;
    }

    public clear(): void
    {
        this.stack = [];
    }

    public forEach(callback: (value: T, index: number, array: T[]) => void): void
    {
        this.stack.forEach(callback);
    }

    public get(index: number): T | undefined
    {
        return this.stack[index];
    }
}


