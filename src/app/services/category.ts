import { HttpClient } from '@angular/common/http';
import { Injectable} from '@angular/core';
import { Observable } from 'rxjs';
import { Category } from '../pages/categories/category.model';


@Injectable({
    providedIn : 'root'
})
export class CategoryService  {
    private apiUrl = 'http://localhost:3000/api/products/categories';

    constructor(private http : HttpClient) {}

     // Método para crear una categoría
    // Retorna un Observable, que es como una "promesa" de que algo llegará del servidor

    createCategory(category : Category): Observable<Category>{
       return this.http.post<Category>(this.apiUrl, category);

    }

    // Método para listar todas las categorías ya guardadas.
    // Lo usaremos para mostrar en pantalla el resultado después de crear una.
    getCategories(): Observable<Category[]> {
       // Agregamos un parámetro único para evitar respuestas 304 sin cuerpo
       // que el navegador pueda tener en caché.
       return this.http.get<Category[]>(`${this.apiUrl}?t=${Date.now()}`);
    }

    // Método para eliminar una categoría por id.
    // El backend responde 204 (sin contenido), por eso usamos
    // responseType: 'text' para evitar errores de parsing de JSON.
    deleteCategory(id: number): Observable<string> {
       return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
    }

    // Método para editar una categoría existente.
    updateCategory(id: number, category: Category): Observable<Category> {
       return this.http.patch<Category>(`${this.apiUrl}/${id}`, category);
    }

}
