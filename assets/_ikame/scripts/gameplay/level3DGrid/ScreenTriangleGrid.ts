import { ProjectedTriangle } from './ProjectedTriangle';

// Screen-space cell edge, in pixels. One cube's projected box is a few dozen pixels across at
// these camera distances, so a cell this size holds the handful of boxes that overlap it while
// keeping the per-triangle insert count (its AABB spans 1-4 cells) low.
const DEFAULT_CELL_SIZE = 64;

// Hard cap on grid resolution, so a huge window (or a bad viewport rect) can never blow up the
// bucket arrays. Beyond this the cells simply get larger.
const MAX_CELLS = 64 * 64;

/**
 * Uniform screen-space bucket grid over a pass's occluder triangles.
 *
 * Without it, every visibility sample is tested against every triangle on screen - O(N^2) in
 * cubes, which is what made the occlusion pass unaffordable. A triangle is registered in every
 * cell its screen AABB touches, so a sample only ever has to test the triangles in its own cell:
 * any triangle that actually covers the sample has an AABB containing it, hence is in that cell.
 *
 * Storage is a counting sort into flat Int32Arrays (counts -> prefix-summed starts -> item list),
 * reused across passes, so a rebuild allocates nothing once the arrays are big enough.
 */
export class ScreenTriangleGrid
{
    private _triangles: readonly ProjectedTriangle[] = null;

    private _originX: number = 0;
    private _originY: number = 0;
    private _invCellSize: number = 1 / DEFAULT_CELL_SIZE;
    private _cols: number = 0;
    private _rows: number = 0;

    private _starts: Int32Array = new Int32Array(0);
    private _counts: Int32Array = new Int32Array(0);
    private _items: Int32Array = new Int32Array(0);

    // Right/top edge of the built rect, kept so build() can tell "partly off-rect" (clamp it)
    // from "fully off-rect" (drop it).
    private _maxX: number = 0;
    private _maxY: number = 0;

    /**
     * Buckets `triangles` over the screen rect [minX, maxX] x [minY, maxY]. Triangles are clipped
     * to that rect; anything fully outside it is dropped, which is safe because a sample outside
     * the viewport is rejected before it ever asks this grid anything.
     */
    public build(triangles: readonly ProjectedTriangle[], minX: number, minY: number, maxX: number, maxY: number): void
    {
        this._triangles = triangles;
        this._originX = minX;
        this._originY = minY;

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        this._maxX = minX + width;
        this._maxY = minY + height;

        let cellSize = DEFAULT_CELL_SIZE;
        // Grow the cells rather than the arrays if the rect would need too many buckets.
        while (Math.ceil(width / cellSize) * Math.ceil(height / cellSize) > MAX_CELLS) cellSize *= 2;

        this._invCellSize = 1 / cellSize;
        this._cols = Math.max(1, Math.ceil(width / cellSize));
        this._rows = Math.max(1, Math.ceil(height / cellSize));

        const cellCount = this._cols * this._rows;
        if (this._counts.length < cellCount)
        {
            this._counts = new Int32Array(cellCount);
            this._starts = new Int32Array(cellCount + 1);
        }
        else
        {
            this._counts.fill(0, 0, cellCount);
        }

        // Pass 1: how many cells does each triangle land in.
        let total = 0;
        for (let i = 0; i < triangles.length; i++)
        {
            const tri = triangles[i];
            if (!this.isInsideRect(tri)) continue;

            const c0 = this.clampedCol(tri.minX), c1 = this.clampedCol(tri.maxX);
            const r0 = this.clampedRow(tri.minY), r1 = this.clampedRow(tri.maxY);

            for (let r = r0; r <= r1; r++)
            {
                const rowBase = r * this._cols;
                for (let c = c0; c <= c1; c++) this._counts[rowBase + c]++;
            }
            total += (c1 - c0 + 1) * (r1 - r0 + 1);
        }

        // Prefix sums: _starts[cell] is where that cell's slice of _items begins.
        let running = 0;
        for (let cell = 0; cell < cellCount; cell++)
        {
            this._starts[cell] = running;
            running += this._counts[cell];
        }
        this._starts[cellCount] = running;

        if (this._items.length < total) this._items = new Int32Array(total);

        // Pass 2: fill each slice. _counts is rewound to 0 and reused as the per-cell write cursor.
        this._counts.fill(0, 0, cellCount);
        for (let i = 0; i < triangles.length; i++)
        {
            const tri = triangles[i];
            if (!this.isInsideRect(tri)) continue;

            const c0 = this.clampedCol(tri.minX), c1 = this.clampedCol(tri.maxX);
            const r0 = this.clampedRow(tri.minY), r1 = this.clampedRow(tri.maxY);

            for (let r = r0; r <= r1; r++)
            {
                const rowBase = r * this._cols;
                for (let c = c0; c <= c1; c++)
                {
                    const cell = rowBase + c;
                    this._items[this._starts[cell] + this._counts[cell]] = i;
                    this._counts[cell]++;
                }
            }
        }
    }

    /**
     * Whether any triangle not owned by `excludeOwner` hides a sample at screen (x, y) with
     * camera-forward depth `z`. The loop lives here rather than in the caller so querying a cell
     * needs no iterator or temporary array.
     */
    public isBlocked(x: number, y: number, z: number, depthEpsilon: number, excludeOwner: number): boolean
    {
        if (!this._triangles) return false;

        if (x < this._originX || x > this._maxX || y < this._originY || y > this._maxY) return false;

        const cell = this.clampedRow(y) * this._cols + this.clampedCol(x);
        const start = this._starts[cell];
        const end = start + this._counts[cell];

        for (let i = start; i < end; i++)
        {
            const tri = this._triangles[this._items[i]];
            if (tri.ownerIndex === excludeOwner) continue;
            if (tri.blocks(x, y, z, depthEpsilon)) return true;
        }
        return false;
    }

    /** Drops the reference to the pass's triangle list. */
    public clear(): void
    {
        this._triangles = null;
        this._cols = 0;
        this._rows = 0;
    }

    /**
     * Whether `tri` overlaps the built rect at all. A triangle that only partly overlaps still
     * belongs in the grid (clamped to the border cells) - its on-rect part can occlude samples.
     */
    private isInsideRect(tri: ProjectedTriangle): boolean
    {
        if (tri.degenerate) return false;
        return tri.maxX >= this._originX && tri.minX <= this._maxX
            && tri.maxY >= this._originY && tri.minY <= this._maxY;
    }

    /** Column for screen x, clamped into the grid. */
    private clampedCol(x: number): number
    {
        const col = Math.floor((x - this._originX) * this._invCellSize);
        return col < 0 ? 0 : (col >= this._cols ? this._cols - 1 : col);
    }

    /** Row for screen y, clamped into the grid. */
    private clampedRow(y: number): number
    {
        const row = Math.floor((y - this._originY) * this._invCellSize);
        return row < 0 ? 0 : (row >= this._rows ? this._rows - 1 : row);
    }
}
