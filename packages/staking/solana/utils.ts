import { TransferFeeConfig } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
// eslint-disable-next-line no-restricted-imports
import BN from "bn.js";

import {
  DEFAULT_FEE_BN,
  FEE_PRECISION_FACTOR_BN,
  SCALE_PRECISION_FACTOR,
  SCALE_PRECISION_FACTOR_BN,
  U64_MAX,
} from "./constants.js";

export const calculateStakeWeight = (minDuration: BN, maxDuration: BN, maxWeight: BN, duration: BN) => {
  const durationSpan = maxDuration.sub(minDuration);
  if (durationSpan.eq(new BN(0))) {
    return SCALE_PRECISION_FACTOR_BN;
  }
  const durationExceedingMin = duration.sub(minDuration);
  const normalizedWeight = durationExceedingMin.mul(SCALE_PRECISION_FACTOR_BN).div(durationSpan);
  const weightDiff = maxWeight.sub(SCALE_PRECISION_FACTOR_BN);

  return BN.max(
    SCALE_PRECISION_FACTOR_BN.add(normalizedWeight.mul(weightDiff).div(SCALE_PRECISION_FACTOR_BN)),
    SCALE_PRECISION_FACTOR_BN,
  );
};

export const calculateFeeAmount = (amount: BN, fee: BN = DEFAULT_FEE_BN) => {
  if (fee.eq(FEE_PRECISION_FACTOR_BN)) {
    return amount;
  }
  return amount.mul(fee).div(FEE_PRECISION_FACTOR_BN);
};

export const calculateDecimalsShift = (maxWeight: bigint, maxShift = 999) => {
  if (maxShift == 0) {
    return 0;
  }

  let decimalsShift = 0;
  while ((maxWeight * U64_MAX) / BigInt(SCALE_PRECISION_FACTOR) / BigInt(10 ** decimalsShift) > U64_MAX) {
    decimalsShift += 1;
    if (decimalsShift == maxShift) {
      return maxShift;
    }
  }
  return decimalsShift;
};

export const divCeilN = (n: bigint, d: bigint): bigint => n / d + (n % d ? BigInt(1) : BigInt(0));

export async function calculateAmountWithTransferFees(
  connection: Connection,
  transferFeeConfig: TransferFeeConfig,
  transferAmount: bigint,
): Promise<{ transferAmount: bigint; feeCharged: bigint }> {
  const epoch = await connection.getEpochInfo();
  const transferFee =
    epoch.epoch >= transferFeeConfig.newerTransferFee.epoch
      ? transferFeeConfig.newerTransferFee
      : transferFeeConfig.olderTransferFee;
  const transferFeeBasisPoints = BigInt(transferFee.transferFeeBasisPoints);
  let feeCharged = BigInt(0);

  if (transferFeeBasisPoints !== BigInt(0)) {
    const numerator = transferAmount * 10_000n;
    const denominator = 10_000n - transferFeeBasisPoints;
    const rawPreFeeAmount = divCeilN(numerator, denominator);
    const fee = rawPreFeeAmount - transferAmount;
    transferAmount = rawPreFeeAmount;
    feeCharged = fee > transferFee.maximumFee ? transferFee.maximumFee : fee;
  }

  return { transferAmount, feeCharged };
}
