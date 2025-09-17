from tqdm.auto import tqdm
import argparse
import json
from typing import Any, Dict

from configs.examples import training_configurations
from core.utils.experiments import make_run_base, unique_run_name, sanitize_name
from core.training.runner import run_experiment
from core.config import TrainConfig


def _run_single(cfg: TrainConfig) -> None:
    base_name = make_run_base(cfg)
    cfg.run_name = unique_run_name(cfg.tb_root, base_name)

    print(
        {
            "model": sanitize_name(cfg.model_flavour),
            "loss": cfg.loss_name,
            "init": "pretrained" if cfg.load_pretrained else "scratch",
        }
    )
    print(f"\n=== Starting run: {cfg.run_name} ===")
    tb_dir = run_experiment(cfg)
    print(f"=== Finished run: {cfg.run_name} | TB logs: {tb_dir} ===")


def main() -> None:
    """Entry point to run one or more experiments.

    - Default: iterate over ``training_configurations`` from python module.
    - Optional: ``--config path.json`` to run a single experiment from JSON
      serialized according to utils.config.TrainConfig fields.
    """
    parser = argparse.ArgumentParser(description="Run training experiments")
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to a JSON file with TrainConfig fields to run a single experiment.",
    )
    args = parser.parse_args()

    if args.config is not None:
        with open(args.config, "r", encoding="utf-8") as f:
            data: Dict[str, Any] = json.load(f)
        # TrainConfig now handles dtype conversion automatically
        cfg = TrainConfig(**data)
        _run_single(cfg)
        return

    pbar = tqdm(training_configurations, desc="Experiments", unit="run")
    for cfg in pbar:
        base_name = make_run_base(cfg)
        cfg.run_name = unique_run_name(cfg.tb_root, base_name)

        pbar.set_postfix(
            {
                "model": sanitize_name(cfg.model_flavour),
                "loss": cfg.loss_name,
                "init": "pretrained" if cfg.load_pretrained else "scratch",
            }
        )

        print(f"\n=== Starting run: {cfg.run_name} ===")
        tb_dir = run_experiment(cfg)
        print(f"=== Finished run: {cfg.run_name} | TB logs: {tb_dir} ===")


if __name__ == "__main__":
    main()
