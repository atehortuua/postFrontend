import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  selector: 'app-start-day',
  templateUrl: './start-day.html',
  styleUrl: './start-day.scss'
})
export class StartDayComponent implements OnInit {
  operators: User[] = [];
  isLoadingOperators = true;
  selectedOperator: User | null = null;

  // Paso 1: Ingreso de clave/PIN del operador
  loginForm: FormGroup;
  isAuthenticating = false;
  authError = '';

  // Paso 2: Modal de Apertura de Turno ("Iniciar el Día") para Cajeros
  showOpenShiftModal = false;
  shiftForm: FormGroup;
  isOpeningShift = false;
  shiftError = '';

  // Presets rápidos de fondo de caja inicial
  cashPresets: number[] = [50000, 100000, 150000, 200000];

  currentDate = new Date();

  constructor(
    private fb: FormBuilder,
    public authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.loginForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.shiftForm = this.fb.group({
      monto_inicial: [100000, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.loadOperators();
  }

  quickBypassJump(targetRoute: string): void {
    this.authService.toggleBypassPermissions(true);
    this.authService.ensureBypassSession();
    this.router.navigate([targetRoute]);
  }

  loadOperators(): void {
    this.isLoadingOperators = true;
    this.authService.getOperators().subscribe({
      next: (users) => {
        this.operators = Array.isArray(users) ? users : [];
        this.isLoadingOperators = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.operators = [];
        this.isLoadingOperators = false;
        this.cdr.markForCheck();
      }
    });
  }

  selectOperator(operator: User): void {
    this.selectedOperator = operator;
    this.authError = '';
    this.loginForm.reset({ password: '' });
  }

  closeOperatorModal(): void {
    this.selectedOperator = null;
    this.authError = '';
    this.loginForm.reset();
  }

  fillDemoPassword(): void {
    if (!this.selectedOperator) return;
    const demoPass = this.selectedOperator.rol === 'admin' ? 'admin123' : 'cajero123';
    this.loginForm.patchValue({ password: demoPass });
  }

  onAuthenticate(): void {
    if (!this.selectedOperator || this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isAuthenticating = true;
    this.authError = '';
    const password = this.loginForm.get('password')?.value;

    this.authService.login(this.selectedOperator.username, password).subscribe({
      next: (res) => {
        this.isAuthenticating = false;
        if (res.user.rol === 'admin') {
          this.router.navigate(['/admin/catalog']);
        } else {
          // Si es cajero, verificar si ya existe un turno abierto o si debe "Iniciar el Día"
          this.checkCashierShift(res.user);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isAuthenticating = false;
        this.authError = err?.error?.message || 'Clave de operador incorrecta. Intenta nuevamente.';
        this.cdr.markForCheck();
      }
    });
  }

  private checkCashierShift(user: User): void {
    this.authService.getActiveShift().subscribe({
      next: (res) => {
        if (res.turno && res.turno.estado === 'abierta') {
          // Ya hay turno abierto, entrar directo a la terminal operativa
          this.router.navigate(['/pos/terminal']);
        } else {
          // No hay turno abierto -> Mostrar pantalla de apertura ("Iniciar el Día")
          this.selectedOperator = user;
          this.showOpenShiftModal = true;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.showOpenShiftModal = true;
        this.cdr.markForCheck();
      }
    });
  }

  setCashPreset(amount: number): void {
    this.shiftForm.patchValue({ monto_inicial: amount });
  }

  onOpenShift(): void {
    if (this.shiftForm.invalid) {
      this.shiftForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUserSignal();
    if (!user) return;

    this.isOpeningShift = true;
    this.shiftError = '';
    const montoInicial = Number(this.shiftForm.get('monto_inicial')?.value || 0);

    this.authService.openShift(montoInicial, user.id).subscribe({
      next: () => {
        this.isOpeningShift = false;
        this.showOpenShiftModal = false;
        this.router.navigate(['/pos/terminal']);
      },
      error: (err) => {
        this.isOpeningShift = false;
        if (err?.status === 409) {
          // Si ya había un turno abierto, avanzar a la terminal
          this.router.navigate(['/pos/terminal']);
        } else {
          this.shiftError = err?.error?.error || 'No se pudo abrir el turno de caja.';
        }
        this.cdr.markForCheck();
      }
    });
  }

  cancelShiftOpen(): void {
    this.authService.logout();
    this.showOpenShiftModal = false;
    this.selectedOperator = null;
  }
}
