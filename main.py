from tqdm.auto import tqdm

from training_configurations.examples import training_configurations
from utils.experiments import make_run_base, unique_run_name, sanitize_name
from utils.runner import run_experiment


def main() -> None:
    """Entry point to run one or more experiments.

    Edit or extend the list in ``training_configurations/`` to define experiments
    and run them here. This file intentionally avoids training details.
    """
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

