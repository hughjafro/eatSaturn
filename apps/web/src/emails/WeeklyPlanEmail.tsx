import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WeeklyPlanEmailProps {
  weekOf: string;
  appUrl?: string;
}

export function WeeklyPlanEmail({
  weekOf,
  appUrl = "https://cartspoon.app",
}: WeeklyPlanEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New weekly sales are in — generate your meal plan now 🛒</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Your deals are in 🛒</Heading>

          <Text style={paragraph}>
            Fresh weekly sale items have been loaded for <strong>week of {weekOf}</strong>. Generate
            your personalized meal plan to see this week's best deals turned into recipes.
          </Text>

          <Section style={btnSection}>
            <Button href={`${appUrl}/plan/generate`} style={button}>
              Generate my meal plan
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You're receiving this because you have weekly notifications enabled.
            <br />
            <a href={`${appUrl}/account`} style={link}>
              Manage notification settings
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#fdfbf7",
  fontFamily: "'Geist', 'Inter', -apple-system, sans-serif",
};

const container: React.CSSProperties = {
  margin: "40px auto",
  maxWidth: "480px",
  padding: "32px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e8e3da",
};

const heading: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "700",
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#4a4a4a",
  margin: "0 0 24px",
};

const btnSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#16a34a",
  color: "#ffffff",
  padding: "12px 28px",
  borderRadius: "8px",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-block",
};

const hr: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #e8e3da",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#9a9a9a",
  lineHeight: "1.5",
};

const link: React.CSSProperties = {
  color: "#9a9a9a",
  textDecoration: "underline",
};
