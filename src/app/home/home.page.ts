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
import {
  ApexChart, ApexXAxis, ApexDataLabels, ApexPlotOptions,
  ApexGrid, ApexStroke, ApexFill, ApexLegend, ApexNonAxisChartSeries
} from 'ng-apexcharts';

// ── Interfaces ───────────────────────────────────────────────
interface Alimento {
  id?: string;
  categoria:    string;
  alimento:     string;
  unidad:       string;
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
  stroke:      ApexStroke;
  fill:        ApexFill;
}

interface DonutOptions {
  series:      ApexNonAxisChartSeries;
  chart:       ApexChart;
  labels:      string[];
  colors:      string[];
  plotOptions: ApexPlotOptions;
  dataLabels:  ApexDataLabels;
  legend:      ApexLegend;
  stroke:      ApexStroke;
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

  // Vista
  seccionActual = 'inicio';

  // Datos
  inventario: Alimento[] = [];
  private sub!: Subscription;

  // Formularios
  formNuevo   = { categoria: '', alimento: '', unidad: 'kg', maxima: null as number|null, minima: null as number|null, porcion: '' };
  formRestock = { idAlimento: '', cantidad: null as number|null };
  formConsumo = { idAlimento: '', turno: '1ro', cantidad: null as number|null };

  // Gráficas
  public chartOptions!: ChartOptions;
  public donutOptions!: DonutOptions;

  // Inyecciones
  private firestore: Firestore         = inject(Firestore);
  private cdr:       ChangeDetectorRef = inject(ChangeDetectorRef);
  private toastCtrl: ToastController   = inject(ToastController);

  // ── Getters ──────────────────────────────────────────────────
  get countOk():   number { return this.inventario.filter(i => i.claseEstatus === 'ok').length; }
  get countWarn(): number { return this.inventario.filter(i => i.claseEstatus === 'warn').length; }
  get countErr():  number { return this.inventario.filter(i => i.claseEstatus === 'err').length; }
  get fechaHoy():  string {
    return new Date().toLocaleDateString('es-MX', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  }

  // ── Constructor ──────────────────────────────────────────────
  constructor() {
    this.initGraficas();
  }

  // ── Lifecycle ────────────────────────────────────────────────
  ngOnInit() {
    setTimeout(() => { this.splashFase = 1; this.cdr.detectChanges(); }, 100);
    setTimeout(() => { this.splashFase = 2; this.cdr.detectChanges(); }, 600);
    setTimeout(() => { this.splashFase = 3; this.cdr.detectChanges(); }, 1100);
    setTimeout(() => { this.mostrarSplash = false; this.cdr.detectChanges(); }, 2400);

    const ref = collection(this.firestore, 'inventario');
    this.sub = collectionData(ref, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.calcularEstatus(item));
      this.refreshGraficas();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  // ── Inicializar gráficas ─────────────────────────────────────
  initGraficas() {
    // Barras con gradiente (estilo "Total Profit" de la imagen)
    this.chartOptions = {
      series:      [{ name: 'Stock Actual', data: [] }],
      chart: {
        type:       'area' as const,
        height:     200,
        toolbar:    { show: false },
        background: 'transparent',
        foreColor:  '#4A5A7A',
        sparkline:  { enabled: false }
      },
      xaxis: {
        categories: [],
        labels: { style: { colors: '#4A5A7A', fontSize: '10px' } },
        axisBorder: { show: false },
        axisTicks:  { show: false }
      },
      colors:      ['#6DBE2E'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      dataLabels:  { enabled: false },
      grid: {
        borderColor:  '#1A2540',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } }
      },
      stroke: {
        curve: 'smooth' as const,
        width: 2
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom:    0.45,
          opacityTo:      0.05,
          stops:          [0, 100]
        }
      }
    };

    // Donut (estilo "Sales Overview" de la imagen)
    this.donutOptions = {
      series:  [1, 0, 0],
      chart: {
        type:       'donut' as const,
        height:     200,
        background: 'transparent',
        foreColor:  '#C8D4F0'
      },
      labels:  ['En Stock', 'Reabastecer', 'Agotados'],
      colors:  ['#6DBE2E', '#F47920', '#FF4A4A'],
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show:  true,
              total: {
                show:      true,
                label:     'Total',
                color:     '#C8D4F0',
                fontSize:  '13px',
                formatter: () => String(this.inventario.length)
              },
              value: {
                color:    '#fff',
                fontSize: '20px',
                fontWeight: '700'
              }
            }
          }
        }
      },
      dataLabels: { enabled: false },
      legend:     { show: false },
      stroke:     { width: 2, colors: ['#0A0E1A'] }
    };
  }

  // ── Refresh gráficas con datos reales ────────────────────────
  refreshGraficas() {
    // Área de stock — top 20 para no saturar
    const top = this.inventario.slice(0, 20);
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Stock', data: top.map(i => i.actual) }],
      xaxis:  { ...this.chartOptions.xaxis, categories: top.map(i => i.alimento) }
    };

    // Donut estatus
    const ok   = this.countOk   || 0;
    const warn = this.countWarn || 0;
    const err  = this.countErr  || 0;
    this.donutOptions = {
      ...this.donutOptions,
      series: [ok || 1, warn, err]   // mínimo 1 para que no quede vacío
    };
  }

  // ── Tema ─────────────────────────────────────────────────────
  isDarkMode = true;
  toggleTheme() { this.isDarkMode = !this.isDarkMode; }

  // ── Estatus ──────────────────────────────────────────────────
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
    if (!this.formConsumo.idAlimento || !this.formConsumo.cantidad)
      return this.toast('Selecciona alimento y cantidad.', 'warning');
    if (Number(this.formConsumo.cantidad) <= 0)
      return this.toast('La cantidad debe ser mayor a 0.', 'warning');
    const item = this.inventario.find(i => i.id === this.formConsumo.idAlimento);
    if (!item) return;
    const nueva = Math.max(0, Number(item.actual) - Number(this.formConsumo.cantidad));
    try {
      await updateDoc(doc(this.firestore, 'inventario', item.id!), { actual: nueva });
      this.formConsumo.cantidad = null;
      this.toast('Consumo registrado correctamente.', 'success');
    } catch { this.toast('Error al registrar consumo.', 'danger'); }
  }

  // ── Firestore: Restock ───────────────────────────────────────
  async registrarIngresoStock() {
    if (!this.formRestock.idAlimento || !this.formRestock.cantidad)
      return this.toast('Selecciona alimento y cantidad.', 'warning');
    const item = this.inventario.find(i => i.id === this.formRestock.idAlimento);
    if (!item) return;
    try {
      await updateDoc(doc(this.firestore, 'inventario', item.id!), {
        actual: Number(item.actual) + Number(this.formRestock.cantidad)
      });
      this.formRestock.cantidad = null;
      this.toast('Stock actualizado correctamente.', 'success');
    } catch { this.toast('Error al actualizar stock.', 'danger'); }
  }

  // ── Firestore: Nuevo Alimento ────────────────────────────────
  async agregarNuevoAlimento() {
    if (!this.formNuevo.alimento?.trim())
      return this.toast('El nombre del alimento es requerido.', 'warning');
    if (!this.formNuevo.maxima || !this.formNuevo.minima)
      return this.toast('Ingresa cantidades máxima y mínima.', 'warning');
    const docId = this.formNuevo.alimento.toLowerCase().trim().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'inventario', docId), { ...this.formNuevo, actual: 0 });
      this.formNuevo = { categoria: '', alimento: '', unidad: 'kg', maxima: null, minima: null, porcion: '' };
      this.toast('Alimento agregado a la base de datos.', 'success');
    } catch { this.toast('Error al guardar el alimento.', 'danger'); }
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
    } catch { this.toast('Error al cerrar el turno.', 'danger'); }
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

  // ── Toast ────────────────────────────────────────────────────
  private async toast(msg: string, color: 'success' | 'warning' | 'danger') {
    const t = await this.toastCtrl.create({ message: msg, duration: 2800, position: 'bottom', color, cssClass: 'custom-toast' });
    await t.present();
  }
}