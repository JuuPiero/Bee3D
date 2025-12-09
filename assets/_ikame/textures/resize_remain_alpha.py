from PIL import Image
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False
    print("Note: tkinterdnd2 not available. Drag & drop functionality will be disabled.")

def process_image(input_path, output_path, target_size):
    """Process the image with alpha channel preservation"""
    try:
        # Open as RGBA
        img = Image.open(input_path).convert("RGBA")
        r, g, b, a = img.split()

        # Resize RGB smoothly, Alpha precisely (no blending)
        r_resized = r.resize(target_size, Image.Resampling.LANCZOS)
        g_resized = g.resize(target_size, Image.Resampling.LANCZOS)
        b_resized = b.resize(target_size, Image.Resampling.LANCZOS)
        a_resized = a.resize(target_size, Image.Resampling.NEAREST)

        # Merge and save as PNG
        final_img = Image.merge("RGBA", (r_resized, g_resized, b_resized, a_resized))
        final_img.save(output_path, format="PNG")
        
        return True, f"✅ Saved fixed texture: {output_path}"
    except Exception as e:
        return False, f"❌ Error processing image: {str(e)}"

class ImageResizerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Resizer with Alpha Preservation")
        self.root.geometry("500x350")
        
        # Variables
        self.input_path = tk.StringVar()
        self.width_var = tk.StringVar(value="512")
        self.height_var = tk.StringVar(value="512")
        
        self.create_widgets()
        
        # Setup drag and drop if available
        if DND_AVAILABLE:
            self.setup_drag_drop()
    
    def create_widgets(self):
        # Main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Input file selection
        ttk.Label(main_frame, text="Select Input Image:").grid(row=0, column=0, sticky=tk.W, pady=5)
        
        file_frame = ttk.Frame(main_frame)
        file_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        self.entry_widget = ttk.Entry(file_frame, textvariable=self.input_path, width=40)
        self.entry_widget.grid(row=0, column=0, sticky=(tk.W, tk.E))
        ttk.Button(file_frame, text="Browse", command=self.browse_file).grid(row=0, column=1, padx=(5, 0))
        
        file_frame.columnconfigure(0, weight=1)
        
        # Drag and drop zone
        drop_text = "📁 Drag & Drop Image Here 📁" if DND_AVAILABLE else "📁 Drag & Drop (install tkinterdnd2) 📁"
        self.drop_frame = tk.Frame(main_frame, bg="#f0f0f0", relief="ridge", bd=2, height=60)
        self.drop_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=10, padx=5)
        self.drop_frame.grid_propagate(False)  # Maintain fixed height
        
        drop_label = tk.Label(self.drop_frame, text=drop_text, bg="#f0f0f0", fg="#666666", font=("Arial", 10))
        drop_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        
        # Target size inputs
        ttk.Label(main_frame, text="Target Size:").grid(row=3, column=0, sticky=tk.W, pady=(20, 5))
        
        size_frame = ttk.Frame(main_frame)
        size_frame.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(size_frame, text="Width:").grid(row=0, column=0, sticky=tk.W)
        ttk.Entry(size_frame, textvariable=self.width_var, width=10).grid(row=0, column=1, padx=(5, 20))
        
        ttk.Label(size_frame, text="Height:").grid(row=0, column=2, sticky=tk.W)
        ttk.Entry(size_frame, textvariable=self.height_var, width=10).grid(row=0, column=3, padx=(5, 0))
        
        # Process button
        ttk.Button(main_frame, text="Process Image", command=self.process_image).grid(row=5, column=0, columnspan=2, pady=20)
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
    
    def browse_file(self):
        filename = filedialog.askopenfilename(
            title="Select Image File",
            filetypes=[
                ("Image files", "*.png *.jpg *.jpeg *.gif *.bmp *.tiff"),
                ("PNG files", "*.png"),
                ("All files", "*.*")
            ]
        )
        if filename:
            self.input_path.set(filename)
    
    def setup_drag_drop(self):
        """Setup drag and drop functionality"""
        # Enable drag and drop on the drop frame and entry widget
        self.drop_frame.drop_target_register(DND_FILES)
        self.drop_frame.dnd_bind('<<Drop>>', self.on_drop)
        self.drop_frame.dnd_bind('<<DragEnter>>', self.on_drag_enter)
        self.drop_frame.dnd_bind('<<DragLeave>>', self.on_drag_leave)
        
        self.entry_widget.drop_target_register(DND_FILES)
        self.entry_widget.dnd_bind('<<Drop>>', self.on_drop)
    
    def on_drag_enter(self, event):
        """Handle drag enter event"""
        self.drop_frame.config(bg="#e6f3ff")
    
    def on_drag_leave(self, event):
        """Handle drag leave event"""
        self.drop_frame.config(bg="#f0f0f0")
    
    def on_drop(self, event):
        """Handle file drop event"""
        self.drop_frame.config(bg="#f0f0f0")
        files = event.data.split()
        if files:
            file_path = files[0].strip('{}')  # Remove braces if present
            # Check if it's an image file
            valid_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'}
            file_ext = os.path.splitext(file_path)[1].lower()
            if file_ext in valid_extensions:
                self.input_path.set(file_path)
            else:
                messagebox.showerror("Invalid File", "Please drop a valid image file (PNG, JPG, GIF, BMP, TIFF)")
    
    def process_image(self):
        # Validate inputs
        if not self.input_path.get():
            messagebox.showerror("Error", "Please select an input image file.")
            return
        
        if not os.path.exists(self.input_path.get()):
            messagebox.showerror("Error", "Input file does not exist.")
            return
        
        try:
            width = int(self.width_var.get())
            height = int(self.height_var.get())
            if width <= 0 or height <= 0:
                raise ValueError("Dimensions must be positive")
        except ValueError:
            messagebox.showerror("Error", "Please enter valid positive integers for width and height.")
            return
        
        # Generate output path
        input_file = self.input_path.get()
        base_name = os.path.splitext(input_file)[0]
        output_file = f"{base_name}_{width}x{height}_resized.png"
        
        # Process the image
        success, message = process_image(input_file, output_file, (width, height))
        
        if success:
            messagebox.showinfo("Success", message)
        else:
            messagebox.showerror("Error", message)

def main():
    if DND_AVAILABLE:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    app = ImageResizerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
