import { LP1PFilter } from "../filters/lp1p-filter";
import { LP2Filter } from "../filters/lp2-filter";
import { DelayLine } from "./delay-line";

enum PluckFilterType {
  kPluck,
  kPluckAndBridge,
  kPickup,
  kPluckAndPickup,
  kBridge,
  kPluckPickupBridge,
}

/**
 * Combination of three filters in one; note that the figure in the book does not show the 
 * variety of connection combinations and filter bypassing possible, nor the multiple
 * output points
 * - filters all come from the FX book below
 * - Pluck Position: a comb filter
 * - Bridge Filter: a lossy integrator with very low fc
 * - Pickup Filter: a 2nd order LPF whose parameters are adjusted differently for guitar vs. bass guitar pickups

 * @author Will Pirkle http://www.willpirkle.com
 * This object is included in Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
 */
export class PluckPosFilter {
  combDelay = new DelayLine(); ///< for pluck position
  bridgeIntegrator = new LP1PFilter(); ///< for bridge LPF
  pickupFilter = new LP2Filter(); /// for simulating an electric guitar pickup

  clear() {
    this.combDelay.clear();
    this.bridgeIntegrator.clear();
  }

  reset(
    _sampleRate: number,
    minimumPitch = 8.176 // 8.176 = MIDI note 0
  ) {
    // ---
    this.combDelay.reset(_sampleRate, minimumPitch);
    this.combDelay.clear();

    this.pickupFilter.reset(_sampleRate);
    this.pickupFilter.setParameters(2500.0, 1.5); // guitar pickup settings

    this.bridgeIntegrator.reset(_sampleRate);
    this.bridgeIntegrator.setParameters(20.0); // lower than the lowest note to synthesize which is note 0
  }

  setDelayInSamples(_delaySamples: number) {
    // --- the (-1) is needed here because of the way the circular buffer counts samples for read/write
    this.combDelay.setDelayInSamples(_delaySamples - 1);
  }

  processAudioSample(xn: number, type: PluckFilterType) {
    if (type == PluckFilterType.kBridge)
      return 12.0 * this.bridgeIntegrator.processAudioSample(xn);

    if (type == PluckFilterType.kPickup)
      return this.pickupFilter.processAudioSample(xn);

    // --- pluck position
    const yn = this.combDelay.readDelay();
    this.combDelay.writeDelay(xn);

    // --- output pluck
    const pluck = 0.5 * (xn - yn);
    if (type == PluckFilterType.kPluck) return pluck;

    // --- pluck and pickup
    if (type == PluckFilterType.kPluckAndPickup)
      return this.pickupFilter.processAudioSample(pluck);

    // --- pluck and bridge
    if (type == PluckFilterType.kPluckAndBridge)
      return 12.0 * this.bridgeIntegrator.processAudioSample(pluck);

    if (type == PluckFilterType.kPluckPickupBridge) {
      const pu = 2.0 * this.pickupFilter.processAudioSample(pluck);
      return 12.0 * this.bridgeIntegrator.processAudioSample(pu);
    }

    return xn; // should never get here
  }
}
