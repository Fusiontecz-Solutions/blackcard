import { APP_LOGO_SRC } from "@/constants/appLogo";
import type { TemplateComponentProps, TemplateVariable } from "./types";
import { pick } from "./types";
import { resolveApplicationRejectionEmailFields } from "./applicationRejectionEmailShared";

export const APPLICATION_REJECTION_EMAIL_VARIABLES: TemplateVariable[] = [
  {
    key: "client_name",
    label: "Client / ISO name",
    placeholder: "John Doe",
    defaultValue: "John Doe",
  },
  {
    key: "primary_reason",
    label: "Primary reason",
    placeholder: "Bad Balances",
    defaultValue: "Bad Balances",
  },
  {
    key: "other_reasons",
    label: "Other reason(s)",
    placeholder: "Negative Days, Low Revenue",
  },
];

const v = APPLICATION_REJECTION_EMAIL_VARIABLES.reduce<
  Record<string, TemplateVariable>
>((acc, variable) => {
  acc[variable.key] = variable;
  return acc;
}, {});

export default function ApplicationRejectionEmail({
  values,
}: TemplateComponentProps) {
  const fields = resolveApplicationRejectionEmailFields({
    client_name: pick(values, v.client_name),
    primary_reason: pick(values, v.primary_reason),
    other_reasons: values[v.other_reasons.key] ?? "",
  });

  return (
    <table
      role="presentation"
      border={0}
      cellPadding={0}
      cellSpacing={0}
      width="100%"
      style={{
        margin: 0,
        padding: 0,
        backgroundColor: "#f4f5f7",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <tbody>
        <tr>
          <td align="center" style={{ padding: "20px 10px" }}>
            <table
              role="presentation"
              align="center"
              border={0}
              cellPadding={0}
              cellSpacing={0}
              width={600}
              style={{
                width: 600,
                maxWidth: 600,
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
              }}
            >
              <tbody>
                {/* Top header accent bar (full purple strip) */}
                <tr>
                  <td
                    style={{
                      padding: 0,
                      lineHeight: 0,
                      fontSize: 0,
                      backgroundColor: "#3d6fa0",
                      height: 34,
                    }}
                  >
                    &nbsp;
                  </td>
                </tr>

                {/* Blue trapezoid tab hanging from the strip */}
                <tr>
                  <td
                    align="center"
                    style={{
                      padding: 0,
                      lineHeight: 0,
                      fontSize: 0,
                      backgroundColor: "#ffffff",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 0,
                        borderTop: "22px solid #002147",
                        borderLeft: "16px solid transparent",
                        borderRight: "16px solid transparent",
                        fontSize: 0,
                        lineHeight: 0,
                        margin: "0 auto",
                      }}
                    />
                  </td>
                </tr>

                {/* Logo */}
                <tr>
                  <td
                    align="center"
                    style={{
                      padding: "26px 45px 0 45px",
                      lineHeight: 0,
                      fontSize: 0,
                      backgroundColor: "#ffffff",
                      textAlign: "center",
                    }}
                  >
                    <img
                      src={APP_LOGO_SRC}
                      alt="Black Card"
                      width={130}
                      style={{
                        display: "block",
                        width: 130,
                        height: "auto",
                        maxWidth: 130,
                        margin: "0 auto",
                      }}
                    />
                  </td>
                </tr>

                {/* Title block */}
                <tr>
                  <td align="center" style={{ padding: "40px 45px 15px 45px" }}>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 32,
                        fontWeight: "bold",
                        lineHeight: 1.2,
                        color: "#002147",
                        letterSpacing: 0.5,
                      }}
                    >
                      APPLICATION <span style={{ color: "#002147" }}>REJECT</span>
                    </h1>
                    <p
                      style={{
                        margin: "16px auto 0",
                        fontSize: 15,
                        lineHeight: 1.5,
                        color: "#666666",
                        maxWidth: 420,
                        textAlign: "center",
                      }}
                    >
                      Thank you for your application.
                      <br />
                      After careful review, we are unable to approve it at this
                      time.
                    </p>
                  </td>
                </tr>

                {/* Body */}
                <tr>
                  <td style={{ padding: "30px 45px 30px 45px" }}>
                    <table
                      role="presentation"
                      border={0}
                      cellPadding={0}
                      cellSpacing={0}
                      width="100%"
                    >
                      <tbody>
                        <tr>
                          <td
                            style={{
                              padding: "0 0 12px 0",
                              fontSize: 14,
                              fontWeight: "bold",
                              lineHeight: 1.3,
                              color: "#333333",
                            }}
                          >
                            Hi {fields.clientName},
                          </td>
                        </tr>

                        <tr>
                          <td
                            style={{
                              padding: "0 0 25px 0",
                              fontSize: 13,
                              lineHeight: 1.6,
                              color: "#777777",
                            }}
                          >
                            Unfortunately, your application does not meet our
                            underwriting criteria.
                          </td>
                        </tr>

                        {/* Reason for decline */}
                        <tr>
                          <td style={{ padding: "0 0 20px 0" }}>
                            <table
                              role="presentation"
                              border={0}
                              cellPadding={0}
                              cellSpacing={0}
                              width="100%"
                            >
                              <tbody>
                                <tr>
                                  <td
                                    valign="middle"
                                    style={{ verticalAlign: "middle" }}
                                  >
                            <table
                              role="presentation"
                              border={0}
                              cellPadding={0}
                              cellSpacing={0}
                              width="100%"
                              style={{
                                border: "1px solid #bce1f6",
                                borderRadius: 12,
                                overflow: "hidden",
                              }}
                            >
                              <tbody>
                                <tr>
                                  <td
                                    width={115}
                                    align="center"
                                    valign="middle"
                                    style={{
                                      width: 115,
                                      backgroundColor: "#0056cd",
                                      padding: "25px 10px",
                                      textAlign: "center",
                                      verticalAlign: "middle",
                                      borderRadius: "10px 0 0 10px",
                                    }}
                                  >
                                    <table
                                      role="presentation"
                                      align="center"
                                      border={0}
                                      cellPadding={0}
                                      cellSpacing={0}
                                      style={{
                                        margin: "0 auto",
                                        backgroundColor: "#ffffff",
                                        borderRadius: "50%",
                                        width: 34,
                                        height: 34,
                                      }}
                                    >
                                      <tbody>
                                        <tr>
                                          <td
                                            align="center"
                                            valign="middle"
                                            style={{
                                              fontSize: 18,
                                              fontWeight: "bold",
                                              color: "#0056cd",
                                              height: 34,
                                              lineHeight: "34px",
                                              textAlign: "center",
                                              verticalAlign: "middle",
                                            }}
                                          >
                                            X
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                    <p
                                      style={{
                                        margin: "12px 0 0 0",
                                        fontSize: 11,
                                        fontWeight: "bold",
                                        lineHeight: 1.3,
                                        color: "#ffffff",
                                        letterSpacing: 0.5,
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      Reason For
                                      <br />
                                      Decline
                                    </p>
                                  </td>

                                  <td
                                    valign="top"
                                    style={{
                                      backgroundColor: "#ffffff",
                                      padding: "20px 25px",
                                      borderRadius: "0 10px 10px 0",
                                    }}
                                  >
                                    <table
                                      role="presentation"
                                      border={0}
                                      cellPadding={0}
                                      cellSpacing={0}
                                      width="100%"
                                    >
                                      <tbody>
                                        <tr>
                                          <td
                                            style={{
                                              fontSize: 11,
                                              fontWeight: "bold",
                                              color: "#da1e28",
                                              paddingBottom: 5,
                                            }}
                                          >
                                            Primary Reason
                                          </td>
                                        </tr>
                                        <tr>
                                          <td
                                            style={{
                                              paddingBottom: 15,
                                              verticalAlign: "middle",
                                            }}
                                          >
                                            <table
                                              role="presentation"
                                              border={0}
                                              cellPadding={0}
                                              cellSpacing={0}
                                            >
                                              <tbody>
                                                <tr>
                                                  <td
                                                    style={{
                                                      fontSize: 18,
                                                      color: "#da1e28",
                                                      paddingRight: 8,
                                                      lineHeight: 1,
                                                      verticalAlign: "middle",
                                                    }}
                                                  >
                                                    &bull;
                                                  </td>
                                                  <td
                                                    style={{
                                                      fontFamily:
                                                        "Georgia, Times, serif",
                                                      fontSize: 18,
                                                      fontWeight: "bold",
                                                      color: "#111111",
                                                      lineHeight: 1,
                                                      verticalAlign: "middle",
                                                    }}
                                                  >
                                                    {fields.primaryReason}
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>

                                        {fields.otherReasons ? (
                                          <>
                                            <tr>
                                              <td
                                                style={{
                                                  borderTop: "1px dashed #cccccc",
                                                  fontSize: 0,
                                                  lineHeight: 0,
                                                  paddingBottom: 12,
                                                }}
                                              >
                                                &nbsp;
                                              </td>
                                            </tr>
                                            <tr>
                                              <td
                                                style={{
                                                  fontSize: 12,
                                                  fontWeight: "bold",
                                                  color: "#333333",
                                                  paddingBottom: 8,
                                                }}
                                              >
                                                Other Reason(s)
                                              </td>
                                            </tr>
                                            <tr>
                                              <td>
                                                <table
                                                  role="presentation"
                                                  border={0}
                                                  cellPadding={0}
                                                  cellSpacing={0}
                                                  style={{
                                                    backgroundColor: "#f2f4f7",
                                                    borderRadius: 4,
                                                  }}
                                                >
                                                  <tbody>
                                                    <tr>
                                                      <td
                                                        style={{
                                                          padding: "6px 12px",
                                                          fontSize: 11,
                                                          color: "#666666",
                                                          verticalAlign:
                                                            "middle",
                                                        }}
                                                      >
                                                        <span
                                                          style={{
                                                            color: "#666666",
                                                            fontSize: 12,
                                                            paddingRight: 5,
                                                            lineHeight: 1,
                                                          }}
                                                        >
                                                          &bull;
                                                        </span>{" "}
                                                        {fields.otherReasons}
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                              </td>
                                            </tr>
                                          </>
                                        ) : null}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                                  </td>
                                  <td
                                    width={18}
                                    valign="middle"
                                    style={{
                                      width: 18,
                                      verticalAlign: "middle",
                                      fontSize: 0,
                                      lineHeight: 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 0,
                                        height: 0,
                                        borderTop: "48px solid transparent",
                                        borderBottom: "48px solid transparent",
                                        borderLeft: "16px solid #bce1f6",
                                        fontSize: 0,
                                        lineHeight: 0,
                                      }}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        {/* Disclaimer */}
                        <tr>
                          <td style={{ padding: "0 0 35px 0" }}>
                            <table
                              role="presentation"
                              border={0}
                              cellPadding={0}
                              cellSpacing={0}
                              width="100%"
                              style={{
                                backgroundColor: "#dff0fa",
                                borderRadius: 6,
                                borderLeft: "4px solid #0056cd",
                              }}
                            >
                              <tbody>
                                <tr>
                                  <td
                                    width={30}
                                    valign="middle"
                                    style={{
                                      padding: "10px 0 10px 12px",
                                      verticalAlign: "middle",
                                      textAlign: "center",
                                    }}
                                  >
                                    <table
                                      role="presentation"
                                      border={0}
                                      cellPadding={0}
                                      cellSpacing={0}
                                      style={{
                                        backgroundColor: "#0056cd",
                                        borderRadius: "50%",
                                        width: 16,
                                        height: 16,
                                        textAlign: "center",
                                      }}
                                    >
                                      <tbody>
                                        <tr>
                                          <td
                                            align="center"
                                            valign="middle"
                                            style={{
                                              fontFamily: "Georgia, serif",
                                              fontSize: 11,
                                              fontWeight: "bold",
                                              color: "#ffffff",
                                              lineHeight: "16px",
                                              height: 16,
                                              textAlign: "center",
                                              fontStyle: "italic",
                                            }}
                                          >
                                            i
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                  <td
                                    style={{
                                      padding: "10px 15px 10px 10px",
                                      fontSize: 11,
                                      lineHeight: 1.4,
                                      color: "#454f63",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    This decision is based on information from
                                    the review of your application and support
                                    documents.
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        <tr>
                          <td
                            style={{
                              padding: "0 0 20px 0",
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: "#888888",
                            }}
                          >
                            This decision is specific to this application and
                            does not affect future submissions.
                          </td>
                        </tr>
                        <tr>
                          <td
                            style={{
                              padding: "0 0 20px 0",
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: "#444444",
                            }}
                          >
                            <strong style={{ color: "#333333" }}>
                              Thank you for considering us as your funding
                              partner.
                            </strong>
                            <br />
                            <span style={{ color: "#777777" }}>
                              We appreciate your interest and wish you success.
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                {/* Footer accent ribbon */}
                <tr>
                  <td style={{ padding: 0, lineHeight: 0, fontSize: 0 }}>
                    <table
                      role="presentation"
                      border={0}
                      cellPadding={0}
                      cellSpacing={0}
                      width="100%"
                      style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}
                    >
                      <tbody>
                        <tr>
                          <td
                            height={12}
                            style={{
                              height: 12,
                              lineHeight: "12px",
                              fontSize: 12,
                              backgroundColor: "#3d6fa0",
                              padding: 0,
                            }}
                          >
                            &nbsp;
                          </td>
                        </tr>
                        <tr>
                          <td
                            height={12}
                            style={{
                              height: 12,
                              lineHeight: "12px",
                              fontSize: 12,
                              backgroundColor: "#002147",
                              padding: 0,
                            }}
                          >
                            &nbsp;
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
