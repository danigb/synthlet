export const PROCESSOR = `(()=>{function d(n){return Object.keys(n).map(t=>{let{min:e,max:r,defaultValue:o}=n[t];return{name:t,minValue:e,maxValue:r,defaultValue:o,automationRate:"k-rate"}})}var a=Math.PI,l=2*a,x=a*a,k=4/a,_=-4/x;var s=5/12,i=Math.pow(10,-1/s),y=1/(1-i),V=1/(1+s*Math.log10(1+i)),w=1/(1+-Math.pow(10,-1/s)),g=s*Math.log10(1+i),C=1/(-s*Math.log10(i)+g);var c=class{constructor(t){this.sampleRate=t;this.halfSamplePeriod=1/(2*t),this.cutoffFrequency=0,this.state=0,this.coeff=0,this.output={LPF1:0,HPF1:0,APF1:0,ANM_LPF1:0},this.update(1e3)}update(t){if(t===this.cutoffFrequency)return;this.cutoffFrequency=t;let e=Math.tan(l*this.cutoffFrequency*this.halfSamplePeriod);this.coeff=e/(1+e)}process(t){let e=(t-this.state)*this.coeff;return this.output.LPF1=(t-this.state)*this.coeff+this.state,this.output.HPF1=t-this.output.LPF1,this.output.APF1=this.output.LPF1-this.output.HPF1,this.output.ANM_LPF1=this.output.LPF1+this.coeff*this.output.HPF1,this.state=e+this.output.LPF1,this.output}};var m={filterType:{min:0,max:14,defaultValue:1},frequency:{min:0,max:1e4,defaultValue:1e3},resonance:{min:0,max:1,defaultValue:.5}},f=class{constructor(t){this.sampleRate=t;this.filterType=0,this.filterVa1=new c(t),this.process=e=>e,this.setParams(1,m.frequency.defaultValue,m.resonance.defaultValue)}setParams(t,e,r){this.filterType!==t&&this.#t(t),this.#e(e,r)}#t(t){switch(this.filterType=t,t){case 1:this.process=e=>this.filterVa1.process(e).LPF1;break;case 2:this.process=e=>this.filterVa1.process(e).HPF1;break;case 3:this.process=e=>this.filterVa1.process(e).APF1;break;default:this.process=e=>e;break}}#e(t,e){switch(this.filterType){case 1:case 2:case 3:this.filterVa1.update(t)}}};var h=class extends AudioWorkletProcessor{constructor(){super();this.processor=new f(sampleRate)}process(e,r,o){let F=o.filterType[0],A=o.frequency[0],L=o.resonance[0];this.processor.setParams(F,A,L);let b=e[0][0],P=r[0][0];if(!b||!P)return!0;for(let u=0;u<P.length;u++)P[u]=this.processor.process(b[u]);return!0}static get parameterDescriptors(){return h.PARAMS}},p=h;p.PARAMS=d(m);registerProcessor("VaFilterWorklet",p);})();`;
