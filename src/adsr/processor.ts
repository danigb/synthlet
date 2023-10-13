export const PROCESSOR = `(()=>{function T(n){return Object.keys(n).map(e=>{let{min:t,max:r,init:a}=n[e];return{name:e,minValue:t,maxValue:r,defaultValue:a,automationRate:"k-rate"}})}var h={gate:{min:0,max:1,init:0},attack:{min:0,max:10,init:.01},decay:{min:0,max:10,init:.1},sustain:{min:0,max:1,init:.5},release:{min:0,max:10,init:.3}},f=class{constructor(e){this.sampleRate=e;this.state=0,this.open=!1,this.output=0,this.attackTime=0,this.decayTime=0,this.releaseTime=0,this.attackCoef=0,this.attackTCO=Math.exp(-1.5),this.decayTCO=Math.exp(-4.95),this.releaseTCO=this.decayTCO,this.setParams(0,h.attack.init,h.decay.init,h.sustain.init,h.release.init)}setGate(e){let t=!!e;this.open!==t&&(this.open=t,t?this.state=1:this.state!==0&&(this.state=4))}setParams(e,t,r,a,o){this.setGate(e),this.setSustainLevel(a),this.setAttackTime(t),this.setDecayTime(r),this.setReleaseTime(o)}process(){switch(this.state){case 0:break;case 1:this.output=this.attackBase+this.output*this.attackCoef,(this.output>=1||this.attackTime<=0)&&(this.output=1,this.state=2);break;case 2:this.output=this.decayBase+this.output*this.decayCoef,(this.output<=this.sustainLevel||this.decayTime<=0)&&(this.output=this.sustainLevel,this.state=3);break;case 3:this.output=this.sustainLevel;break;case 4:this.output=this.releaseBase+this.output*this.releaseCoef,(this.output<=0||this.releaseTime<=0)&&(this.output=0,this.state=0)}return this.output}setSustainLevel(e){this.sustainLevel!==e&&(this.sustainLevel=e,this.decayTime=-1)}setAttackTime(e){if(this.attackTime===e)return;this.attackTime=e;let t=this.sampleRate*e,r=this.attackTCO;this.attackCoef=Math.exp(-Math.log((1+r)/r)/t),this.attackBase=(1+r)*(1-this.attackCoef)}setDecayTime(e){if(this.decayTime===e)return;this.decayTime=e;let t=this.sampleRate*e,r=this.decayTCO;this.decayCoef=Math.exp(-Math.log((1+r)/r)/t),this.decayBase=(this.sustainLevel-r)*(1-this.decayCoef)}setReleaseTime(e){if(this.releaseTime===e)return;this.releaseTime=e;let t=this.sampleRate*e,r=this.releaseTCO;this.releaseCoef=Math.exp(-Math.log((1+r)/r)/t),this.releaseBase=-r*(1-this.releaseCoef)}};var d=Math.PI,I=2*d,N=d*d,c=1e-9,x=Math.max;var B=4/d,E=-4/N;var l=5/12,b=Math.pow(10,-1/l),F=1/(1-b),_=1/(1+l*Math.log10(1+b)),$=1/(1+-Math.pow(10,-1/l)),D=l*Math.log10(1+b),j=1/(-l*Math.log10(b)+D);function A(n,e,t){return Math.max(e,Math.min(t,n))}var y=class{constructor(){this.hi=!1}process(e,t=0,r=1){return this.hi=e>=1&&!this.hi,this.hi}};function P(n){let e=!1,t=!1,r=!1,a=new y,o=0,m=0,i=0,p=0,s=0;function u(C,v,S,M,g){e=C>=1,a.process(C)&&(t=!0,r=!0),i=M,o=A(1/(c+n*v),c,.5),m=x(-.5,(i-1)/(c+n*S)),p=x(-1,-(i+c)/(c+n*g))}function O(){return r?(e?t?(s+=o,s>=1&&(s=1,t=!1)):s<i+.001?s=i:s+=m:(s+=p,s<=p&&(r=!1)),s):0}return{setParams:u,process:O}}var R={gate:{min:0,max:1,init:0},attack:{min:0,max:10,init:.01},decay:{min:0,max:10,init:.1},sustain:{min:0,max:1,init:.5},release:{min:0,max:10,init:.3}},W=T(R),k=class extends AudioWorkletProcessor{constructor(t){super();this.#e(t?.processorOptions?.type==="linear"?"linear":"exp"),this.port.onmessage=r=>{let a=r.data?.type==="linear"?"linear":"exp";this.t!==a&&this.#e(a)}}#e(t){this.t=t,this.p=t==="linear"?P(sampleRate):new f(sampleRate),this.p.setParams(0,.01,.1,.5,.3)}process(t,r,a){this.p.setParams(a.gate[0],a.attack[0],a.decay[0],a.sustain[0],a.release[0]);let o=t[0],m=r[0],i=Math.min(o.length,m.length);if(i===0)return!0;let p=o[0].length;for(let s=0;s<p;s++)for(let u=0;u<i;u++)m[u][s]=o[u][s]*this.p.process();return!0}static get parameterDescriptors(){return W}};registerProcessor("AdsrWorklet",k);})();`;
