import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import {
  Firestore, collection, doc,
  updateDoc, setDoc, collectionData, addDoc
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexChart, ApexXAxis, ApexDataLabels, ApexPlotOptions, ApexGrid } from 'ng-apexcharts';

// ── Interfaces ───────────────────────────────────────────────
interface Alimento {
  id?: string;
  categoria:    string;
  alimento:     string;
  unidad:       string;   // kg | L | mL | g | pza
  maxima:       number;
  minima:       number;
  actual:       number;
  porcion:      string;
  claseEstatus?: 'ok' | 'warn' | 'err';
  textoEstatus?: string;
}

interface ChartOptions {
  series:      { name: string; data: number[] }[];
  chart:       ApexChart;
  xaxis:       ApexXAxis;
  colors:      string[];
  plotOptions: ApexPlotOptions;
  dataLabels:  ApexDataLabels;
  grid:        ApexGrid;
}

// ── Componente ───────────────────────────────────────────────
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, NgApexchartsModule]
})
export class HomePage implements OnInit, OnDestroy {

  // Splash
  mostrarSplash = true;
  splashFase    = 0;

  // Tema
  isDarkMode    = true;
  seccionActual = 'resumen';

  // Datos
  inventario: Alimento[] = [];
  private sub!: Subscription;

  // Formularios
  formNuevo   = { categoria: '', alimento: '', unidad: 'kg', maxima: null as number|null, minima: null as number|null, porcion: '' };
  formRestock = { idAlimento: '', cantidad: null as number|null };
  formConsumo = { idAlimento: '', turno: '1ro', cantidad: null as number|null };

  // Gráfica
  public chartOptions!: ChartOptions;

  // Inyecciones
  private firestore: Firestore         = inject(Firestore);
  private cdr:       ChangeDetectorRef = inject(ChangeDetectorRef);
  private toastCtrl: ToastController   = inject(ToastController);

  // ── Getters para KPI cards (reemplazan el pipe statsFilter) ──
  get countOk():   number { return this.inventario.filter(i => i.claseEstatus === 'ok').length; }
  get countWarn(): number { return this.inventario.filter(i => i.claseEstatus === 'warn').length; }
  get countErr():  number { return this.inventario.filter(i => i.claseEstatus === 'err').length; }

  // ── Constructor ──────────────────────────────────────────────
  constructor() {
    this.initGrafica();
  }

  // ── Lifecycle ────────────────────────────────────────────────
  ngOnInit() {
    // Splash orquestado por fases
    setTimeout(() => { this.splashFase = 1; this.cdr.detectChanges(); }, 100);
    setTimeout(() => { this.splashFase = 2; this.cdr.detectChanges(); }, 600);
    setTimeout(() => { this.splashFase = 3; this.cdr.detectChanges(); }, 1100);
    setTimeout(() => { this.mostrarSplash = false; this.cdr.detectChanges(); }, 2400);

    // Firestore — con cleanup automático
    const ref = collection(this.firestore, 'inventario');
    this.sub = collectionData(ref, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.calcularEstatus(item));
      this.refreshGrafica();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // ── Gráfica ──────────────────────────────────────────────────
  initGrafica() {
    this.chartOptions = {
      series:      [{ name: 'Stock Actual', data: [] }],
      chart:       {
        height:     300,
        type:       'bar' as const,   // <-- ChartType fix
        toolbar:    { show: false },
        background: 'transparent',
        foreColor:  '#4A5A7A'
      },
      xaxis:       {
        categories: [],
        labels: { style: { colors: '#4A5A7A', fontSize: '11px' } }
      },
      colors:      ['#6DBE2E'],
      plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
      dataLabels:  { enabled: false },
      grid:        { borderColor: '#1A2540' }
    };
  }

  refreshGrafica() {
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Stock', data: this.inventario.map(i => i.actual) }],
      xaxis:  { ...this.chartOptions.xaxis, categories: this.inventario.map(i => i.alimento) }
    };
  }

  // ── Tema ─────────────────────────────────────────────────────
  toggleTheme() { this.isDarkMode = !this.isDarkMode; }

  // ── Estatus semáforo ─────────────────────────────────────────
  calcularEstatus(item: Alimento) {
    if (item.actual <= 0) {
      item.textoEstatus = 'AGOTADO';     item.claseEstatus = 'err';
    } else if (item.actual <= item.minima) {
      item.textoEstatus = 'REABASTECER'; item.claseEstatus = 'warn';
    } else {
      item.textoEstatus = 'EN STOCK';    item.claseEstatus = 'ok';
    }
  }

  // ── Firestore: Consumo ───────────────────────────────────────
  async registrarConsumoTurno() {
    if (!this.formConsumo.idAlimento || !this.formConsumo.cantidad) {
      return this.toast('Selecciona alimento y cantidad.', 'warning');
    }
    if (Number(this.formConsumo.cantidad) <= 0) {
      return this.toast('La cantidad debe ser mayor a 0.', 'warning');
    }
    const item = this.inventario.find(i => i.id === this.formConsumo.idAlimento);
    if (!item) return;
    const nueva = Math.max(0, Number(item.actual) - Number(this.formConsumo.cantidad));
    try {
      await updateDoc(doc(this.firestore, 'inventario', item.id!), { actual: nueva });
      this.formConsumo.cantidad = null;
      this.toast(`Consumo registrado correctamente.`, 'success');
    } catch {
      this.toast('Error al registrar consumo.', 'danger');
    }
  }

  // ── Firestore: Restock ───────────────────────────────────────
  async registrarIngresoStock() {
    if (!this.formRestock.idAlimento || !this.formRestock.cantidad) {
      return this.toast('Selecciona alimento y cantidad.', 'warning');
    }
    const item = this.inventario.find(i => i.id === this.formRestock.idAlimento);
    if (!item) return;
    try {
      await updateDoc(doc(this.firestore, 'inventario', item.id!), {
        actual: Number(item.actual) + Number(this.formRestock.cantidad)
      });
      this.formRestock.cantidad = null;
      this.toast('Stock actualizado correctamente.', 'success');
    } catch {
      this.toast('Error al actualizar stock.', 'danger');
    }
  }

  // ── Firestore: Nuevo Alimento ────────────────────────────────
  async agregarNuevoAlimento() {
    if (!this.formNuevo.alimento?.trim()) {
      return this.toast('El nombre del alimento es requerido.', 'warning');
    }
    if (!this.formNuevo.maxima || !this.formNuevo.minima) {
      return this.toast('Ingresa cantidades máxima y mínima.', 'warning');
    }
    const docId = this.formNuevo.alimento.toLowerCase().trim().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'inventario', docId), { ...this.formNuevo, actual: 0 });
      this.formNuevo = { categoria: '', alimento: '', unidad: 'kg', maxima: null, minima: null, porcion: '' };
      this.toast('Alimento agregado a la base de datos.', 'success');
    } catch {
      this.toast('Error al guardar el alimento.', 'danger');
    }
  }

  // ── Cerrar Turno ─────────────────────────────────────────────
  async cerrarTurno() {
    try {
      await addDoc(collection(this.firestore, 'historial_turnos'), {
        fecha:              new Date().toISOString(),
        inventarioSnapshot: this.inventario,
        totalItems:         this.inventario.length
      });
      this.toast('Turno cerrado. Historial guardado.', 'success');
      this.exportarExcel();
    } catch {
      this.toast('Error al cerrar el turno.', 'danger');
    }
  }

  // ── Exportar Excel ───────────────────────────────────────────
  exportarExcel() {
    const datos = this.inventario.map(i => ({
      Categoría:      i.categoria,
      Alimento:       i.alimento,
      Unidad:         i.unidad,
      Máximo:         i.maxima,
      Mínimo:         i.minima,
      'Stock Actual': i.actual,
      Estatus:        i.textoEstatus
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Reporte_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`);
  }

  // ── Toast helper ─────────────────────────────────────────────
  private async toast(msg: string, color: 'success' | 'warning' | 'danger') {
    const t = await this.toastCtrl.create({
      message:  msg,
      duration: 2800,
      position: 'bottom',
      color,
      cssClass: 'custom-toast'
    });
    await t.present();
  }
}