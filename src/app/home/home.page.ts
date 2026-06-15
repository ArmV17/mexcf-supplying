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
  categoria:     string;
  alimento:      string;
  unidad:        string;   // kg | g | L | mL | pza
  maxima:        number;
  minima:        number;
  actual:        number;
  porcion:       string;
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

  // ── Transición landing → dashboard ──────────────────────────
  transicionActiva  = false;
  dashboardEntrando = false;

  // ── Vista y tema ────────────────────────────────────────────
  seccionActual = 'inicio';
  isDarkMode    = false;   // landing inicia en modo DÍA

  // ── Datos ───────────────────────────────────────────────────
  inventario: Alimento[] = [];
  private sub!: Subscription;

  // ── Formularios ─────────────────────────────────────────────
  formNuevo   = { categoria: '', alimento: '', unidad: 'kg', maxima: null as number|null, minima: null as number|null, porcion: '' };
  formRestock = { idAlimento: '', cantidad: null as number|null };
  formConsumo = { idAlimento: '', turno: '1ro', cantidad: null as number|null };

  // ── Gráficas ────────────────────────────────────────────────
  public chartOptions!: ChartOptions;
  public donutOptions!: DonutOptions;

  // ── Inyecciones ─────────────────────────────────────────────
  private firestore: Firestore         = inject(Firestore);
  private cdr:       ChangeDetectorRef = inject(ChangeDetectorRef);
  private toastCtrl: ToastController   = inject(ToastController);

  // ── Getters ─────────────────────────────────────────────────
  get countOk():   number { return this.inventario.filter(i => i.claseEstatus === 'ok').length; }
  get countWarn(): number { return this.inventario.filter(i => i.claseEstatus === 'warn').length; }
  get countErr():  number { return this.inventario.filter(i => i.claseEstatus === 'err').length; }
  get fechaHoy():  string {
    return new Date().toLocaleDateString('es-MX', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  // ── Constructor ─────────────────────────────────────────────
  constructor() { this.initGraficas(); }

  // ── Lifecycle ───────────────────────────────────────────────
  ngOnInit() {
    // Firestore en tiempo real
    const ref = collection(this.firestore, 'inventario');
    this.sub = collectionData(ref, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.calcularEstatus(item));
      this.refreshGraficas();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  // ── Transición animada landing → dashboard ───────────────────
  entrarAlApp() {
    // 1. Mostrar overlay de transición
    this.transicionActiva = true;
    this.cdr.detectChanges();

    // 2. Después de 900ms cambiar a dashboard con animación de entrada
    setTimeout(() => {
      this.seccionActual    = 'resumen';
      this.dashboardEntrando = true;
      this.isDarkMode        = true;   // dashboard siempre dark
      this.cdr.detectChanges();

      // 3. Ocultar overlay
      setTimeout(() => {
        this.transicionActiva = false;
        this.cdr.detectChanges();

        // 4. Quitar clase de entrada tras animación
        setTimeout(() => {
          this.dashboardEntrando = false;
          this.cdr.detectChanges();
        }, 600);
      }, 300);
    }, 900);
  }

  // ── Toggle tema ─────────────────────────────────────────────
  toggleTheme() { this.isDarkMode = !this.isDarkMode; }

  // ── Estatus semáforo ────────────────────────────────────────
  calcularEstatus(item: Alimento) {
    if (item.actual <= 0) {
      item.textoEstatus = 'AGOTADO';     item.claseEstatus = 'err';
    } else if (item.actual <= item.minima) {
      item.textoEstatus = 'REABASTECER'; item.claseEstatus = 'warn';
    } else {
      item.textoEstatus = 'EN STOCK';    item.claseEstatus = 'ok';
    }
  }

  // ── Gráficas ────────────────────────────────────────────────
  initGraficas() {
    // Área con gradiente — "Total Profit" style
    this.chartOptions = {
      series:      [{ name: 'Stock Actual', data: [] }],
      chart: {
        type:       'area' as const,
        height:     380,            // altura aumentada para que se vea completa
        toolbar:    { show: false },
        background: 'transparent',
        foreColor:  '#4A5A7A',
        animations: { enabled: true, speed: 600, dynamicAnimation: { enabled: true, speed: 400 } }
      },
      xaxis: {
        categories: [],
        labels: {
          rotate:   -45,
          style:    { colors: '#4A5A7A', fontSize: '10px' },
          maxHeight: 80
        },
        axisBorder: { show: false },
        axisTicks:  { show: false }
      },
      colors:      ['#6DBE2E'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      dataLabels:  { enabled: false },
      grid: {
        borderColor:     '#1A2540',
        strokeDashArray: 3,
        xaxis:           { lines: { show: false } }
      },
      stroke: { curve: 'smooth' as const, width: 2 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom:    0.5,
          opacityTo:      0.03,
          stops:          [0, 100]
        }
      }
    };

    // Donut compacto — más pequeño
    this.donutOptions = {
      series:  [1, 0, 0],
      chart: {
        type:       'donut' as const,
        height:     160,
        background: 'transparent',
        foreColor:  '#C8D4F0',
        animations: { enabled: true }
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
              value: { color: '#fff', fontSize: '22px', fontWeight: '700' }
            }
          }
        }
      },
      dataLabels: { enabled: false },
      legend:     { show: false },
      stroke:     { width: 2, colors: ['#0A0E1A'] }
    };
  }

  refreshGraficas() {
    // Top 25 alimentos para que la gráfica no se sature
    const top = this.inventario.slice(0, 25);
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Stock', data: top.map(i => i.actual) }],
      xaxis:  { ...this.chartOptions.xaxis, categories: top.map(i => i.alimento) }
    };

    const ok   = this.countOk   || 0;
    const warn = this.countWarn || 0;
    const err  = this.countErr  || 0;
    this.donutOptions = {
      ...this.donutOptions,
      series: [ok || 1, warn, err]
    };
  }

  // ── Firestore: Consumo ──────────────────────────────────────
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

  // ── Firestore: Restock ──────────────────────────────────────
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

  // ── Firestore: Nuevo Alimento ───────────────────────────────
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

  // ── Cerrar Turno ────────────────────────────────────────────
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

  // ── Exportar Excel ──────────────────────────────────────────
  exportarExcel() {
    const datos = this.inventario.map(i => ({
      Categoría:      i.categoria,
      Alimento:       i.alimento,
      Unidad:         i.unidad,
      Máximo:         `${i.maxima} ${i.unidad}`,
      Mínimo:         `${i.minima} ${i.unidad}`,
      'Stock Actual': `${i.actual} ${i.unidad}`,
      Estatus:        i.textoEstatus
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Reporte_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`);
  }

  // ── Toast helper ────────────────────────────────────────────
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