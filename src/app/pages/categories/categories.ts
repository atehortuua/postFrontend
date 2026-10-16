import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../services/category';
import { ProductService } from '../../services/product';
import { Category } from './category.model';
import { Product } from '../../models/product.model';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  selector: 'app-categories',
  styleUrl: './categories.scss',
  templateUrl: './categories.html',
})
export class CategoriesComponent implements OnInit {
  // Lista de categorías y productos
  categories: Category[] = [];
  products: Product[] = [];

  // Filtros y selección
  selectedCategoryId: number | null = null;
  selectedProduct: Product | null = null;
  searchTerm = '';
  stockFilter: 'all' | 'normal' | 'low' | 'out' = 'all';

  // Indicadores de carga y peticiones asíncronas
  isLoadingCategories = true;
  isLoadingProducts = true;
  isSubmittingCategory = false;
  isSubmittingProduct = false;

  // Estados de modales
  showCategoryModal = false;
  editingCategory: Category | null = null;
  showProductModal = false;
  editingProduct: Product | null = null;

  // Modal de confirmación para eliminación
  showConfirmDeleteModal = false;
  deleteType: 'category' | 'product' | null = null;
  pendingDeleteTarget: { id: number; nombre: string } | null = null;

  // Sistema de notificaciones Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null = null;
  private toastTimeout: number | null = null;

  // Formularios reactivos
  categoryForm: FormGroup;
  productForm: FormGroup;

  // Paleta de iconos rápidos sugeridos para el sector gastronómico / POS
  popularIcons: string[] = ['🍔', '🌭', '🍟', '🍕', '🥤', '🍺', '🥗', '🍰', '🍦', '☕', '🥪', '🍗', '🌮', '🍩'];

  constructor(
    private fb: FormBuilder,
    private categoryService: CategoryService,
    private productService: ProductService,
    private cdr: ChangeDetectorRef
  ) {
    // Inicialización del formulario reactivo de categorías
    this.categoryForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      icono: ['🍔', [Validators.required, Validators.maxLength(50)]],
    });

    // Inicialización del formulario reactivo de productos
    this.productForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      categoria_id: [null, [Validators.required]],
      descripcion: ['', [Validators.maxLength(250)]],
      precio_venta: [0, [Validators.required, Validators.min(0)]],
      precio_costo: [0, [Validators.min(0)]],
      stock_actual: [0, [Validators.required, Validators.min(0)]],
      control_stock: [true],
    });
  }

  ngOnInit(): void {
    this.loadAllData();
  }

  // Carga paralela de categorías y productos
  loadAllData(): void {
    this.loadCategories();
    this.loadProducts();
  }

  // ==========================================
  // GESTIÓN DE CATEGORÍAS
  // ==========================================
  loadCategories(): void {
    this.isLoadingCategories = true;
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = Array.isArray(data) ? data : [];
        this.isLoadingCategories = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.categories = [];
        this.isLoadingCategories = false;
        this.showToast('Error al conectar con el servidor para cargar categorías', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  selectCategory(categoryId: number | null): void {
    this.selectedCategoryId = categoryId;
    this.selectedProduct = null;
  }

  openCreateCategoryModal(): void {
    this.editingCategory = null;
    this.categoryForm.reset({
      nombre: '',
      icono: '🍔',
    });
    this.showCategoryModal = true;
  }

  openEditCategoryModal(category: Category, event: MouseEvent): void {
    event.stopPropagation();
    this.editingCategory = category;
    this.categoryForm.reset({
      nombre: category.nombre,
      icono: category.icono || '📌',
    });
    this.showCategoryModal = true;
  }

  closeCategoryModal(): void {
    this.showCategoryModal = false;
    this.editingCategory = null;
    this.categoryForm.reset();
  }

  selectIcon(icon: string): void {
    this.categoryForm.patchValue({ icono: icon });
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSubmittingCategory = true;
    const formValue = this.categoryForm.value;

    if (this.editingCategory && this.editingCategory.id) {
      // Actualizar categoría existente
      this.categoryService.updateCategory(this.editingCategory.id, formValue).subscribe({
        next: (updated) => {
          this.showToast(`Categoría "${updated.nombre}" actualizada con éxito`, 'success');
          this.closeCategoryModal();
          this.loadCategories();
          this.loadProducts(); // Refrescar nombres de categoría vinculados
          this.isSubmittingCategory = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al actualizar la categoría', 'error');
          this.isSubmittingCategory = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      // Crear nueva categoría
      this.categoryService.createCategory(formValue).subscribe({
        next: (created) => {
          this.showToast(`Categoría "${created.nombre}" creada con éxito`, 'success');
          this.closeCategoryModal();
          this.loadCategories();
          this.isSubmittingCategory = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al crear la categoría', 'error');
          this.isSubmittingCategory = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  confirmDeleteCategory(category: Category, event: MouseEvent): void {
    event.stopPropagation();
    if (!category.id) return;

    // Verificar si la categoría tiene productos asignados
    const count = this.getProductCountForCategory(category.id);
    if (count > 0) {
      this.showToast(`No puedes eliminar "${category.nombre}" porque contiene ${count} producto(s). Reasígnalos primero.`, 'error');
      return;
    }

    this.deleteType = 'category';
    this.pendingDeleteTarget = { id: category.id, nombre: category.nombre };
    this.showConfirmDeleteModal = true;
  }

  // ==========================================
  // GESTIÓN DE PRODUCTOS
  // ==========================================
  loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts().subscribe({
      next: (data) => {
        this.products = Array.isArray(data) ? data : [];
        this.isLoadingProducts = false;
        // Si el producto seleccionado fue modificado o eliminado, refrescarlo
        if (this.selectedProduct) {
          this.selectedProduct = this.products.find((p) => p.id === this.selectedProduct?.id) || null;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.products = [];
        this.isLoadingProducts = false;
        this.showToast('Error al conectar con el servidor para cargar productos', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  selectProduct(product: Product): void {
    this.selectedProduct = this.selectedProduct?.id === product.id ? null : product;
  }

  openCreateProductModal(): void {
    this.editingProduct = null;
    this.productForm.reset({
      nombre: '',
      categoria_id: this.selectedCategoryId || (this.categories[0]?.id ?? null),
      descripcion: '',
      precio_venta: 0,
      precio_costo: 0,
      stock_actual: 10,
      control_stock: true,
    });
    this.showProductModal = true;
  }

  openEditProductModal(product: Product, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.editingProduct = product;
    this.productForm.reset({
      nombre: product.nombre,
      categoria_id: product.categoria_id,
      descripcion: product.descripcion || '',
      precio_venta: product.precio_venta,
      precio_costo: product.precio_costo || 0,
      stock_actual: product.stock_actual,
      control_stock: Boolean(product.control_stock),
    });
    this.showProductModal = true;
  }

  closeProductModal(): void {
    this.showProductModal = false;
    this.editingProduct = null;
    this.productForm.reset();
  }

  saveProduct(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSubmittingProduct = true;
    const formValue = this.productForm.value;

    if (this.editingProduct && this.editingProduct.id) {
      // Actualizar producto
      this.productService.updateProduct(this.editingProduct.id, formValue).subscribe({
        next: (updated) => {
          this.showToast(`Producto "${updated.nombre}" actualizado con éxito`, 'success');
          this.closeProductModal();
          this.loadProducts();
          this.isSubmittingProduct = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al actualizar el producto', 'error');
          this.isSubmittingProduct = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      // Crear producto
      this.productService.createProduct(formValue).subscribe({
        next: (created) => {
          this.showToast(`Producto "${created.nombre}" creado exitosamente`, 'success');
          this.closeProductModal();
          this.loadProducts();
          this.isSubmittingProduct = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al crear el producto', 'error');
          this.isSubmittingProduct = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  confirmDeleteProduct(product: Product, event: MouseEvent): void {
    event.stopPropagation();
    if (!product.id) return;
    this.deleteType = 'product';
    this.pendingDeleteTarget = { id: product.id, nombre: product.nombre };
    this.showConfirmDeleteModal = true;
  }

  // Ajuste rápido de stock (+1 o -1)
  adjustStock(product: Product, delta: number, event: MouseEvent): void {
    event.stopPropagation();
    if (!product.id) return;
    const newStock = Math.max(0, product.stock_actual + delta);
    if (newStock === product.stock_actual) return;

    this.productService.updateStock(product.id, newStock).subscribe({
      next: () => {
        product.stock_actual = newStock;
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('No se pudo actualizar el stock del producto', 'error');
      },
    });
  }

  // Ejecución de la eliminación confirmada
  executeDelete(): void {
    if (!this.pendingDeleteTarget) return;

    const { id, nombre } = this.pendingDeleteTarget;

    if (this.deleteType === 'category') {
      this.categoryService.deleteCategory(id).subscribe({
        next: () => {
          this.showToast(`Categoría "${nombre}" eliminada`, 'success');
          if (this.selectedCategoryId === id) {
            this.selectedCategoryId = null;
          }
          this.loadCategories();
          this.closeDeleteModal();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al eliminar la categoría', 'error');
          this.closeDeleteModal();
          this.cdr.markForCheck();
        },
      });
    } else if (this.deleteType === 'product') {
      this.productService.deleteProduct(id).subscribe({
        next: () => {
          this.showToast(`Producto "${nombre}" eliminado del menú`, 'success');
          if (this.selectedProduct?.id === id) {
            this.selectedProduct = null;
          }
          this.loadProducts();
          this.closeDeleteModal();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.showToast(err?.error?.error || 'Error al eliminar el producto', 'error');
          this.closeDeleteModal();
          this.cdr.markForCheck();
        },
      });
    }
  }

  closeDeleteModal(): void {
    this.showConfirmDeleteModal = false;
    this.deleteType = null;
    this.pendingDeleteTarget = null;
  }

  // ==========================================
  // HELPERS Y COMPUTADOS
  // ==========================================
  getProductCountForCategory(categoryId: number): number {
    return this.products.filter((p) => p.categoria_id === categoryId).length;
  }

  get filteredProducts(): Product[] {
    return this.products.filter((product) => {
      // Filtro por categoría
      if (this.selectedCategoryId !== null && product.categoria_id !== this.selectedCategoryId) {
        return false;
      }

      // Filtro por término de búsqueda
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        const matchesName = product.nombre.toLowerCase().includes(term);
        const matchesDesc = product.descripcion ? product.descripcion.toLowerCase().includes(term) : false;
        if (!matchesName && !matchesDesc) {
          return false;
        }
      }

      // Filtro por stock
      if (this.stockFilter === 'out') {
        return product.control_stock && product.stock_actual === 0;
      }
      if (this.stockFilter === 'low') {
        return product.control_stock && product.stock_actual > 0 && product.stock_actual <= 5;
      }
      if (this.stockFilter === 'normal') {
        return !product.control_stock || product.stock_actual > 5;
      }

      return true;
    });
  }

  // Estadísticas para las métricas del header
  get totalCategoriesCount(): number {
    return this.categories.length;
  }

  get totalProductsCount(): number {
    return this.products.length;
  }

  get lowStockProductsCount(): number {
    return this.products.filter((p) => p.control_stock && p.stock_actual <= 5).length;
  }

  get inventoryValue(): number {
    return this.products.reduce((acc, p) => acc + (p.precio_venta * (p.stock_actual || 0)), 0);
  }

  getSelectedCategoryName(): string {
    if (this.selectedCategoryId === null) return 'Todas las Categorías';
    const cat = this.categories.find((c) => c.id === this.selectedCategoryId);
    return cat ? `${cat.icono || '🏷️'} ${cat.nombre}` : 'Categoría';
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toast = { message, type };
    this.toastTimeout = window.setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 4000);
    this.cdr.markForCheck();
  }
}
