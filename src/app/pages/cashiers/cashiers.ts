import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  selector: 'app-cashiers',
  templateUrl: './cashiers.html',
  styleUrl: './cashiers.scss'
})
export class CashiersComponent implements OnInit {
  users: User[] = [];
  isLoading = true;
  isSubmitting = false;

  showUserModal = false;
  editingUser: User | null = null;
  userForm: FormGroup;

  toast: { message: string; type: 'success' | 'error' } | null = null;

  constructor(
    private fb: FormBuilder,
    public authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.userForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      rol: ['cajero', [Validators.required]],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.authService.getAllUsers().subscribe({
      next: (data) => {
        this.users = Array.isArray(data) ? data : [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.users = [];
        this.isLoading = false;
        this.showToast('No se pudo cargar la lista de cajeros', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  openCreateModal(): void {
    this.editingUser = null;
    this.userForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      rol: ['cajero', [Validators.required]],
      activo: [true]
    });
    this.showUserModal = true;
  }

  openEditModal(user: User): void {
    this.editingUser = user;
    this.userForm = this.fb.group({
      nombre: [user.nombre, [Validators.required, Validators.minLength(2)]],
      username: [user.username, [Validators.required, Validators.minLength(3)]],
      password: [''], // Opcional al editar
      rol: [user.rol, [Validators.required]],
      activo: [Boolean(user.activo)]
    });
    this.showUserModal = true;
  }

  closeModal(): void {
    this.showUserModal = false;
    this.editingUser = null;
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const val = this.userForm.value;

    if (this.editingUser) {
      this.authService.updateUser(this.editingUser.id, val).subscribe({
        next: (updated) => {
          this.isSubmitting = false;
          this.showToast(`Operador "${updated.nombre}" actualizado correctamente`, 'success');
          this.closeModal();
          this.loadUsers();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.showToast(err?.error?.error || 'Error al actualizar el cajero', 'error');
          this.cdr.markForCheck();
        }
      });
    } else {
      this.authService.createUser(val).subscribe({
        next: (created) => {
          this.isSubmitting = false;
          this.showToast(`Cajero "${created.nombre}" registrado exitosamente`, 'success');
          this.closeModal();
          this.loadUsers();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.showToast(err?.error?.error || 'Error al registrar el cajero', 'error');
          this.cdr.markForCheck();
        }
      });
    }
  }

  toggleUserActive(user: User): void {
    if (user.id === 1) {
      this.showToast('El administrador principal no puede desactivarse', 'error');
      return;
    }
    const newStatus = !user.activo;
    this.authService.updateUser(user.id, {
      nombre: user.nombre,
      username: user.username,
      rol: user.rol,
      activo: newStatus
    }).subscribe({
      next: () => {
        user.activo = newStatus ? 1 : 0;
        this.showToast(
          `Operador "${user.nombre}" ${newStatus ? 'activado' : 'desactivado'}`,
          'success'
        );
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showToast(err?.error?.error || 'No se pudo cambiar el estado', 'error');
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/start-day']);
  }

  get activeCashiersCount(): number {
    return this.users.filter((u) => u.rol === 'cajero' && u.activo).length;
  }

  showToast(message: string, type: 'success' | 'error'): void {
    this.toast = { message, type };
    setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 3500);
    this.cdr.markForCheck();
  }
}
