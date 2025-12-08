export class Queue<T>
{
    private items: T[] = [];

    constructor(items: T[] = [])
    {
        this.items = items;
    }

    // Add an item to the queue
    enqueue(item: T): void {
        this.items.push(item);
    }

    enqueueMultiple(newItems: T[]): void {
        this.items.push(...newItems);
    }

    // Remove and return the first item in the queue
    dequeue(): T | undefined {
        return this.items.shift();
    }

    // Peek at the first item without removing it
    peek(): T | undefined {
        return this.items[0];
    }

    // Check if the queue is empty
    isEmpty(): boolean {
        return this.items.length === 0;
    }

    // Get the size of the queue
    size(): number {
        return this.items.length;
    }

    public get Items(): T[] {
        return this.items;
    }

    public clear(): void {
        this.items = [];
    }
}