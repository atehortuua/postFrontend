import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = 'http://localhost:3000/api/products';

  constructor(private http: HttpClient) {}

  /**
   * Obtiene la lista completa de productos activos desde el backend.
   * Se incluye un query param con timestamp para evitar respuestas 304 cacheadas.
   */
  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}?t=${Date.now()}`);
  }

  /**
   * Crea un nuevo producto en la base de datos a través de la API.
   * @param product Datos del producto a registrar
   */
  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, product);
  }

  /**
   * Actualiza los datos generales de un producto existente.
   * @param id Identificador numérico del producto
   * @param product Nuevos datos del producto
   */
  updateProduct(id: number, product: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/${id}`, product);
  }

  /**
   * Elimina un producto por su ID (soft delete en el backend).
   * Se utiliza responseType 'text' dado que el backend retorna HTTP 204 No Content.
   * @param id Identificador numérico del producto
   */
  deleteProduct(id: number): Observable<string> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }

  /**
   * Actualiza únicamente las unidades de inventario de un producto.
   * @param id Identificador numérico del producto
   * @param stock_actual Cantidad de stock nueva
   */
  updateStock(id: number, stock_actual: number): Observable<{ message: string; id: number; stock_actual: number }> {
    return this.http.patch<{ message: string; id: number; stock_actual: number }>(
      `${this.apiUrl}/${id}/stock`,
      { stock_actual }
    );
  }
}
