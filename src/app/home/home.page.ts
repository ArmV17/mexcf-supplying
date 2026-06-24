import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import {
  Firestore, collection, doc,
  updateDoc, setDoc, collectionData, addDoc, query, where, orderBy, getDocs
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  ApexChart, ApexXAxis, ApexDataLabels, ApexPlotOptions,
  ApexGrid, ApexStroke, ApexFill, ApexLegend, ApexNonAxisChartSeries, ApexYAxis
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
  porcion:      number;
  claseEstatus?: 'ok' | 'warn' | 'err';
  textoEstatus?: string;
}

interface RegistroTurno {
  id?: string;
  fecha:      string;   // ISO date YYYY-MM-DD
  turno:      '1ro' | '2do';
  idAlimento: string;
  alimento:   string;
  unidad:     string;
  cantidad:   number;
  timestamp:  string;
}

interface ChartOptions {
  series:      { name: string; data: number[] }[];
  chart:       ApexChart;
  xaxis:       ApexXAxis;
  yaxis:       ApexYAxis;
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

  // ==========================================
  // VARIABLES DE ESTADO Y TRANSICIÓN
  // ==========================================
  transicionActiva  = false;
  dashboardEntrando = false;
  seccionActual     = 'inicio';
  isDarkMode        = false;

  // ==========================================
  // VARIABLES DE LOGIN Y EDICIÓN
  // ==========================================
  mostrarModalLogin = false;
  loginUsuario      = '';
  loginPassword     = '';
  private readonly USER_ADMIN = 'admin';
  private readonly PASS_ADMIN = '12345';

  productoAEditar: Alimento | null = null;
  nuevaCategoriaVal = '';

  // ==========================================
  // DATOS Y FORMULARIOS
  // ==========================================
  inventario: Alimento[] = [];
  private sub!: Subscription;

  formNuevo   = { categoria: '', alimento: '', unidad: 'kg', maxima: null as number|null, minima: null as number|null, porcion: null as number|null };
  formRestock = { idAlimento: '', cantidad: null as number|null };
  formConsumo = { idAlimento: '', turno: '1ro' as '1ro'|'2do', cantidad: null as number|null };

  // Import Excel
  archivoExcel: File | null = null;
  importando = false;
  importPreview: any[] = [];

  // Gráficas historial por turno
  periodoHistorial: 'dia' | 'semana' | 'mes' | 'anio' = 'dia';
  chartTurnos!: ChartOptions;

  // Gráficas
  public chartOptions!: ChartOptions;
  public donutOptions!: DonutOptions;

  // Inyecciones
  private firestore: Firestore         = inject(Firestore);
  private cdr:       ChangeDetectorRef = inject(ChangeDetectorRef);
  private toastCtrl: ToastController   = inject(ToastController);

  // ── Getters ─────────────────────────────────────────────────
  get countOk():   number { return this.inventario.filter(i => i.claseEstatus === 'ok').length; }
  get countWarn(): number { return this.inventario.filter(i => i.claseEstatus === 'warn').length; }
  get countErr():  number { return this.inventario.filter(i => i.claseEstatus === 'err').length; }
  get fechaHoy():  string {
    return new Date().toLocaleDateString('es-MX', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  }

  constructor() { this.initGraficas(); }

  // ── Lifecycle ────────────────────────────────────────────────
  ngOnInit() {
    const ref = collection(this.firestore, 'inventario');
    this.sub = collectionData(ref, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.calcularEstatus(item));
      this.refreshGraficas();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  // ── MÉTODOS DE LOGIN ─────────────────────────────────────────
  abrirLogin() {
    this.mostrarModalLogin = true;
  }

  cerrarLogin() {
    this.mostrarModalLogin = false;
    this.loginUsuario      = '';
    this.loginPassword     = '';
  }

  verificarLogin() {
    if (this.loginUsuario.trim() === this.USER_ADMIN && this.loginPassword === this.PASS_ADMIN) {
      this.cerrarLogin();
      this.entrarAlApp();
    } else {
      this.toast('Usuario o contraseña incorrectos', 'danger');
    }
  }

  // ── MÉTODOS DE EDICIÓN DE CATEGORÍA ──────────────────────────
  abrirEditarCategoria(item: Alimento) {
    this.productoAEditar   = item;
    this.nuevaCategoriaVal = item.categoria;
  }

  cerrarEditarCategoria() {
    this.productoAEditar   = null;
    this.nuevaCategoriaVal = '';
  }

  async guardarCategoriaEditada() {
    if (!this.productoAEditar?.id) return;
    
    const categoriaLimpia = this.nuevaCategoriaVal.trim();
    if (!categoriaLimpia) {
      return this.toast('La categoría no puede quedar vacía', 'warning');
    }

    try {
      const docRef = doc(this.firestore, 'inventario', this.productoAEditar.id);
      await updateDoc(docRef, { categoria: categoriaLimpia });
      
      this.toast('Categoría actualizada correctamente', 'success');
      this.cerrarEditarCategoria();
    } catch (error) {
      this.toast('Error al actualizar la categoría', 'danger');
    }
  }

  // ── Transición animada ──────────────────────────────────────
  entrarAlApp() {
    this.transicionActiva = true;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.seccionActual     = 'resumen';
      this.dashboardEntrando = true;
      this.isDarkMode        = true;
      this.cdr.detectChanges();
      setTimeout(() => {
        this.transicionActiva = false;
        this.cdr.detectChanges();
        setTimeout(() => { this.dashboardEntrando = false; this.cdr.detectChanges(); }, 600);
      }, 300);
    }, 900);
  }

  toggleTheme() { this.isDarkMode = !this.isDarkMode; }

  // ── Estatus ─────────────────────────────────────────────────
  calcularEstatus(item: Alimento) {
    if (item.actual <= 0) {
      item.textoEstatus = 'AGOTADO';     item.claseEstatus = 'err';
    } else if (item.actual <= item.minima) {
      item.textoEstatus = 'REABASTECER'; item.claseEstatus = 'warn';
    } else {
      item.textoEstatus = 'EN STOCK';    item.claseEstatus = 'ok';
    }
  }

  // ── Gráficas base ───────────────────────────────────────────
  initGraficas() {
    this.chartOptions = {
      series: [{ name: 'Stock Actual', data: [] }],
      chart: {
        type: 'area' as const, height: 380, toolbar: { show: false },
        background: 'transparent', foreColor: '#4A5A7A',
        animations: { enabled: true, speed: 600, dynamicAnimation: { enabled: true, speed: 400 } }
      },
      xaxis: {
        categories: [],
        labels: { rotate: -45, style: { colors: '#4A5A7A', fontSize: '10px' }, maxHeight: 80 },
        axisBorder: { show: false }, axisTicks: { show: false }
      },
      yaxis: { labels: { style: { colors: '#4A5A7A', fontSize: '10px' } } },
      colors: ['#6DBE2E'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      dataLabels: { enabled: false },
      grid: { borderColor: '#1A2540', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      stroke: { curve: 'smooth' as const, width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.03, stops: [0, 100] } }
    };

    this.donutOptions = {
      series: [1, 0, 0],
      chart: { type: 'donut' as const, height: 160, background: 'transparent', foreColor: '#C8D4F0', animations: { enabled: true } },
      labels: ['En Stock', 'Reabastecer', 'Agotados'],
      colors: ['#6DBE2E', '#F47920', '#FF4A4A'],
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              total: { show: true, label: 'Total', color: '#C8D4F0', fontSize: '13px', formatter: () => String(this.inventario.length) },
              value: { color: '#fff', fontSize: '22px', fontWeight: '700' }
            }
          }
        }
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      stroke: { width: 2, colors: ['#0A0E1A'] }
    };

    this.chartTurnos = {
      series: [
        { name: '1er Turno', data: [] },
        { name: '2do Turno', data: [] }
      ],
      chart: {
        type: 'bar' as const, height: 320, toolbar: { show: false },
        background: 'transparent', foreColor: '#4A5A7A',
        animations: { enabled: true, speed: 500, dynamicAnimation: { enabled: true, speed: 350 } }
      },
      xaxis: {
        categories: [],
        labels: { rotate: -35, style: { colors: '#4A5A7A', fontSize: '10px' }, maxHeight: 80 },
        axisBorder: { show: false }, axisTicks: { show: false }
      },
      yaxis: { labels: { style: { colors: '#4A5A7A', fontSize: '10px' } } },
      colors: ['#6DBE2E', '#F47920'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '55%', grouped: true } as any },
      dataLabels: { enabled: false },
      grid: { borderColor: '#1A2540', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      stroke: { show: true, width: 2, colors: ['transparent'] },
      fill: { opacity: 1 }
    };
  }

  refreshGraficas() {
    const top = this.inventario.slice(0, 25);
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Stock', data: top.map(i => i.actual) }],
      xaxis:  { ...this.chartOptions.xaxis, categories: top.map(i => i.alimento) }
    };
    this.donutOptions = {
      ...this.donutOptions,
      series: [this.countOk || 1, this.countWarn, this.countErr]
    };
  }

  // ── Historial de turnos ────────────────────────────────────
  async cargarHistorialTurnos() {
    const ahora  = new Date();
    let fechaDesde: Date;

    if (this.periodoHistorial === 'dia') {
      fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    } else if (this.periodoHistorial === 'semana') {
      fechaDesde = new Date(ahora); fechaDesde.setDate(ahora.getDate() - 7);
    } else if (this.periodoHistorial === 'mes') {
      fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    } else {
      fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    }

    const isoDesde = fechaDesde.toISOString();
    const q = query(
      collection(this.firestore, 'consumo_turnos'),
      where('timestamp', '>=', isoDesde),
      orderBy('timestamp', 'asc')
    );
    const snap = await getDocs(q);
    const registros: RegistroTurno[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroTurno));

    // Agrupar por alimento
    const alimentos = [...new Set(registros.map(r => r.alimento))];
    const t1Map: Record<string, number> = {};
    const t2Map: Record<string, number> = {};

    registros.forEach(r => {
      if (r.turno === '1ro') t1Map[r.alimento] = (t1Map[r.alimento] || 0) + r.cantidad;
      else                   t2Map[r.alimento] = (t2Map[r.alimento] || 0) + r.cantidad;
    });

    this.chartTurnos = {
      ...this.chartTurnos,
      series: [
        { name: '1er Turno', data: alimentos.map(a => t1Map[a] || 0) },
        { name: '2do Turno', data: alimentos.map(a => t2Map[a] || 0) }
      ],
      xaxis: { ...this.chartTurnos.xaxis, categories: alimentos }
    };
    this.cdr.detectChanges();
  }

  // ── Importar Excel → Firestore ──────────────────────────────
  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.archivoExcel = input.files[0];
    this.parsearExcelPreview();
  }

  parsearExcelPreview() {
    if (!this.archivoExcel) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const wb  = XLSX.read(e.target.result, { type: 'binary' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      let categoriaActual = '';
      this.importPreview = [];

      raw.forEach((fila: any[]) => {
        const cat  = String(fila[0] || '').trim();
        const ali  = String(fila[1] || '').trim();
        if (!ali) return;                     

        if (cat) categoriaActual = cat;       

        const parseCantidad = (val: any): { cantidad: number; unidad: string } => {
          const s = String(val || '').trim();
          const n = parseFloat(s);
          const u = s.replace(/[\d.,\s]/g, '').trim() || 'kg';
          return { cantidad: isNaN(n) ? 0 : n, unidad: u };
        };

        const max     = parseCantidad(fila[2]);
        const min     = parseCantidad(fila[3]);
        const actual  = parseCantidad(fila[4]);
        const porcion = parseCantidad(fila[5]);

        this.importPreview.push({
          categoria: categoriaActual,
          alimento:  ali,
          unidad:    max.unidad || min.unidad || 'kg',
          maxima:    max.cantidad,
          minima:    min.cantidad,
          actual:    actual.cantidad || max.cantidad,  
          porcion:   porcion.cantidad
        });
      });
      this.cdr.detectChanges();
    };
    reader.readAsBinaryString(this.archivoExcel);
  }

  async importarExcelAFirestore() {
    if (!this.importPreview.length) return;
    this.importando = true;
    let ok = 0; let err = 0;
    for (const item of this.importPreview) {
      const docId = item.alimento.toLowerCase().trim().replace(/\s+/g, '-');
      try {
        await setDoc(doc(this.firestore, 'inventario', docId), item, { merge: true });
        ok++;
      } catch { err++; }
    }
    this.importando = false;
    this.archivoExcel = null;
    this.importPreview = [];
    this.toast(`${ok} alimentos importados.${err ? ` ${err} errores.` : ''}`, err ? 'warning' : 'success');
    this.cdr.detectChanges();
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
      const hoy = new Date();
      await addDoc(collection(this.firestore, 'consumo_turnos'), {
        fecha:      hoy.toISOString().split('T')[0],
        turno:      this.formConsumo.turno,
        idAlimento: item.id,
        alimento:   item.alimento,
        unidad:     item.unidad,
        cantidad:   Number(this.formConsumo.cantidad),
        timestamp:  hoy.toISOString()
      } as RegistroTurno);
      this.formConsumo.cantidad = null;
      this.toast('Consumo registrado.', 'success');
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
      this.toast('Stock actualizado.', 'success');
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
      this.formNuevo = { categoria: '', alimento: '', unidad: 'kg', maxima: null, minima: null, porcion: null };
      this.toast('Alimento agregado.', 'success');
    } catch { this.toast('Error al guardar.', 'danger'); }
  }

  // ── Cerrar Turno ────────────────────────────────────────────
  async cerrarTurno() {
    try {
      await addDoc(collection(this.firestore, 'historial_turnos'), {
        fecha:              new Date().toISOString(),
        inventarioSnapshot: this.inventario,
        totalItems:         this.inventario.length
      });
      this.toast('Turno cerrado y guardado en base de datos.', 'success');
    } catch { this.toast('Error al cerrar el turno.', 'danger'); }
  }

  // ── Exportar Excel ──────────────────────────────────────────
  exportarExcel() {
    const categorias = [...new Set(this.inventario.map(i => i.categoria))];
    const filas: any[][] = [
      ['', 'ALIMENTO', 'CANTIDAD MAXIMA', 'CANTIDAD MINIMA', 'CANTIDAD ACTUAL', 'PORCION POR PERSONA', 'ESTATUS']
    ];

    categorias.forEach(cat => {
      const items = this.inventario.filter(i => i.categoria === cat);
      items.forEach((item, idx) => {
        filas.push([
          idx === 0 ? cat : '',
          item.alimento,
          `${item.maxima} ${item.unidad}`,
          `${item.minima} ${item.unidad}`,
          `${item.actual} ${item.unidad}`,
          `${item.porcion || ''} ${item.unidad}`,
          item.textoEstatus || ''
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Inventario_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`);
  }

  private async toast(msg: string, color: 'success' | 'warning' | 'danger') {
    const t = await this.toastCtrl.create({ message: msg, duration: 2800, position: 'bottom', color, cssClass: 'custom-toast' });
    await t.present();
  }
}